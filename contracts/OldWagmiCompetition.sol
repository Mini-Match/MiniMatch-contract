// SPDX-License-Identifier: MIT

//
//  $$\      $$\  $$$$$$\   $$$$$$\  $$\      $$\ $$$$$$\
//  $$ | $\  $$ |$$  __$$\ $$  __$$\ $$$\    $$$ |\_$$  _|
//  $$ |$$$\ $$ |$$ /  $$ |$$ /  \__|$$$$\  $$$$ |  $$ |
//  $$ $$ $$\$$ |$$$$$$$$ |$$ |$$$$\ $$\$$\$$ $$ |  $$ |
//  $$$$  _$$$$ |$$  __$$ |$$ |\_$$ |$$ \$$$  $$ |  $$ |
//  $$$  / \$$$ |$$ |  $$ |$$ |  $$ |$$ |\$  /$$ |  $$ |
//  $$  /   \$$ |$$ |  $$ |\$$$$$$  |$$ | \_/ $$ |$$$$$$\
//  \__/     \__|\__|  \__| \______/ \__|     \__|\______|
//
pragma solidity ^0.8.20;

import {IVRFCoordinatorV2} from "./interfaces/IVRFCoordinatorV2.sol";
import {IWagmiCompetition} from "./interfaces/IWagmiCompetition.sol";

import {Math} from "./libraries/Math.sol";
import {PercentageMath} from "./libraries/PercentageMath.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract OldWagmiCompetition is IWagmiCompetition, Ownable, Pausable {
    using Math for uint256;
    using PercentageMath for uint256;

    // Game settings

    uint256 private constant MAX_X = 5_000;
    uint256 private constant MAX_Y = 5_000;

    uint256 private constant CENTER_MAX_SHIFT = 116;
    uint256 private constant CENTER_RANGE = CENTER_MAX_SHIFT * 2;

    // Investment & Sales settings

    uint256 private constant TIME_AFTER_FUNDED = 7 days;
    // uint256 private constant MAX_TICKETS_PER_PLAYER = 150;

    uint256 private constant REFERRAL_FACTOR_BPS = 95_00;
    uint256 private constant REFERRAL_REWARDS_BPS = 60_00;
    uint256 private constant INVESTOR_DISTRIBUTION_BPS = 60_00;

    uint256 private immutable INVESTMENT_GOAL;
    uint256 private immutable REFERRAL_THRESHOLD;

    // Game setup

    bytes32 private immutable COMMIT;
    uint256 public commitX;
    uint256 public commitY;

    // Accounting

    mapping(address => uint256) public salesOf;
    mapping(address => uint256) public ticketsOf;
    mapping(address => uint256) public investmentOf;
    mapping(bytes32 => Coupon) public couponFromHash;

    uint256 public claimableInvestment; // Total amount dedicated for distribution over investmentOf
    uint256 public totalSales;
    uint256 public totalInvestment;
    uint256 public endTimestamp;

    // Chainlink VRF

    uint32 private constant NB_WORDS = 1;
    uint16 private constant MIN_REQ_CONFIRMATIONS = 3;
    uint32 private constant CALLBACK_GAS_LIMIT = 100_000;

    bytes32 private immutable KEY_HASH;
    uint64 private immutable SUBSCRIPTION_ID; // Chainlink VRF subscription ID
    IVRFCoordinatorV2 private immutable VRF_COORDINATOR; // Chainlink coordinator

    uint256 private centerRequestId;
    uint256 private winnerRequestId;

    uint256 public centerX;
    uint256 public centerY;

    // Game state

    Bet[] public bets;
    Prize[] internal _prizes;

    Bet public winningBet;

    State public state;
    uint256[] public closestBetIds;

    modifier atState(State requiredState) {
        require(state == requiredState, "Inappropriate state");

        _;
    }

    modifier atStates(State state1, State state2) {
        require(state == state1 || state == state2, "Inappropriate state");

        _;
    }

    constructor(
        address coordinator,
        bytes32 keyHash,
        bytes32 commit,
        uint64 subscriptionId,
        Prize[] memory prizes,
        uint256 maxPrizePrice,
        uint256 referralThreshold
    )  Ownable(msg.sender) {
        COMMIT = commit;
        SUBSCRIPTION_ID = subscriptionId;
        VRF_COORDINATOR = IVRFCoordinatorV2(coordinator);
        KEY_HASH = keyHash;
        INVESTMENT_GOAL = maxPrizePrice;
        REFERRAL_THRESHOLD = referralThreshold;

        uint256 nbPrizes = prizes.length;
        for (uint256 i; i < nbPrizes; ++i) {
            _prizes.push(prizes[i]);
        }

        state = State.Initial;
    }

    /// HOUSE ///

    function setCouponPrizeId(bytes32[] calldata couponHashes, Coupon[] calldata coupons)
        external
        onlyOwner
        atStates(State.Initial, State.InvestmentReached)
    {
        uint256 nbCoupons = coupons.length;
        require(couponHashes.length == nbCoupons, "Incompatible nb of hashes & coupons");

        for (uint256 i; i < nbCoupons; ++i) {
            Coupon memory coupon = coupons[i];

            uint256 prizeId = coupon.prizeId;
            require(prizeId <= _prizes.length, "Invalid prize ID");

            couponFromHash[couponHashes[i]] = coupon;
        }
    }

    function setIsPaused(bool isPaused) external onlyOwner {
        if (isPaused) _pause();
        else _unpause();
    }

    function finishGame(uint256 x, uint256 y) external onlyOwner atState(State.InvestmentReached) {
        require(COMMIT == keccak256(abi.encode(x, y)), "Commit does not match");
        require(block.timestamp > endTimestamp, "Finish game after timeout only");

        commitX = x % MAX_X;
        commitY = y % MAX_Y;

        state = State.GameFinished;

        centerRequestId = VRF_COORDINATOR.requestRandomWords(
            KEY_HASH, SUBSCRIPTION_ID, MIN_REQ_CONFIRMATIONS, CALLBACK_GAS_LIMIT, NB_WORDS
        );

        emit GameFinished(totalInvestment, totalSales);
    }

    function findWinner(uint256[] calldata _closestBetIds)
        external
        onlyOwner
        atState(State.RandomCoordinatesExecuted)
    {
        require(_closestBetIds.length > 0, "At least 1 candidate required");

        closestBetIds = _closestBetIds;

        if (closestBetIds.length == 1) return _setRandomWinner(0);

        state = State.FindWinnerExecuted;

        winnerRequestId = VRF_COORDINATOR.requestRandomWords(
            KEY_HASH, SUBSCRIPTION_ID, MIN_REQ_CONFIRMATIONS, CALLBACK_GAS_LIMIT, NB_WORDS
        );
    }

    function emergencyTerminate() external onlyOwner {
        state = State.EmergencyTerminated;

        emit GameTerminated(totalInvestment, totalSales);
    }

    function withdrawPrizePurchaseFunds(uint256 amount) external onlyOwner atState(State.WinnerFound) {
        amount = Math.min(amount, wonPrize().price);

        uint256 salesProfit = totalSales.zeroFloorSub(amount);

        uint256 houseProfit;
        if (salesProfit > 0) {
            // Sales cover the prize purchase: investors are in profit.
            uint256 investmentProfit =
                salesProfit.percentMul(INVESTOR_DISTRIBUTION_BPS) * totalInvestment / INVESTMENT_GOAL;

            houseProfit = salesProfit - investmentProfit;
            claimableInvestment = totalInvestment + investmentProfit;
        } else {
            // Sales don't cover the prize purchase: investors are in loss.
            claimableInvestment = totalInvestment + totalSales - amount;
        }

        state = State.FundsWithdrawn;

        emit PurchasePrizeFundsWitdhrawn(amount, houseProfit);

        SafeTransferLib.safeTransferETH(msg.sender, amount + houseProfit);
    }

    /// EXTERNAL ///

    /// @notice Used by investors to invest in the competition.
    function invest() external payable atState(State.Initial) whenNotPaused {
        uint256 max = INVESTMENT_GOAL.zeroFloorSub(totalInvestment).zeroFloorSub(totalSales);
        require(max > 0 || msg.sender == owner(), "Investment goal reached");

        uint256 amount = msg.value;
        if (amount >= max) {
            amount = max;
            state = State.InvestmentReached;

            endTimestamp = block.timestamp + TIME_AFTER_FUNDED;
        }

        totalInvestment += amount;
        investmentOf[msg.sender] += amount;

        emit Invested(msg.sender, amount);
    }

    /// @notice Used by players to place bets on the location of the commit.
    /// @dev Player must send the total price of tickets along with the tx.
    function placeBets(Bet[] calldata userBets, address referral)
        external
        payable
        atStates(State.Initial, State.InvestmentReached)
        whenNotPaused
    {
        require(userBets.length > 0, "At least 1 bet required");
        require(referral != msg.sender, "Referal and referee cannot be the same");
        require(state == State.Initial || endTimestamp > block.timestamp, "Game stopped after timeout");
        // require(ticketsOf[msg.sender] + userBets.length <= MAX_TICKETS_PER_PLAYER, "Too many bets");

        uint256 totalPrice;
        uint256 nbBets = userBets.length;

        for (uint256 i; i < nbBets; ++i) {
            Bet memory bet = userBets[i];

            uint256 x = bet.x;
            uint256 y = bet.y;

            require((x > 0 || y > 0), "x == 0 && y == 0");
            require(x <= MAX_X, "X > max");
            require(y <= MAX_Y, "Y > max");

            bytes32 couponCode = bet.couponCode;
            uint256 prizeId = bet.prizeId;

            if (couponCode != bytes32(0)) {
                bytes32 couponHash = keccak256(abi.encode(couponCode));
                Coupon storage coupon = couponFromHash[couponHash];

                uint128 remaining = coupon.remaining;
                require(remaining > 0, "No remaining coupon usage");

                uint256 couponPrizeId = coupon.prizeId;
                require(couponPrizeId > 0 && couponPrizeId == prizeId, "Coupon used with incorrect prize");

                coupon.remaining = remaining - 1;
            } else {
                totalPrice += prize(prizeId).ticketPrice;
            }

            bet.player = msg.sender;

            bets.push(bet);

            emit BetPlaced(msg.sender, prizeId, x, y);
        }

        uint256 referralReward;
        if (isReferralValid(referral)) {
            referralReward = totalPrice.percentMul(REFERRAL_REWARDS_BPS);
            totalPrice = totalPrice.percentMul(REFERRAL_FACTOR_BPS);
        }

        require(msg.value == totalPrice, "Invalid value");

        ticketsOf[msg.sender] += nbBets;

        emit TotalBetPlaced(msg.sender, nbBets);

        if (totalPrice > 0) {
            uint256 sales = totalPrice - referralReward;

            salesOf[msg.sender] += sales;
            totalSales += sales;
        }

        if (referralReward > 0) {
            emit ReferralRewarded(referral, msg.sender, referralReward);

            SafeTransferLib.safeTransferETH(referral, referralReward);
        }
    }

    function claimInvestment() external atState(State.FundsWithdrawn) {
        require(investmentOf[msg.sender] != 0, "Nothing to claim");

        uint256 profit = claimableInvestment * investmentOf[msg.sender] / totalInvestment;

        investmentOf[msg.sender] = 0;

        emit InvestmentClaimed(msg.sender, profit);

        if (profit > 0) SafeTransferLib.safeTransferETH(msg.sender, profit);
    }

    /// @notice Claims investment in case the game was terminated in emergency.
    function claimInvestmentEmergency() external atState(State.EmergencyTerminated) {
        uint256 claim = investmentOf[msg.sender];
        require(claim > 0, "Nothing to claim");

        investmentOf[msg.sender] = 0;

        emit InvestmentClaimedEmergency(msg.sender, claim);

        SafeTransferLib.safeTransferETH(msg.sender, claim);
    }

    /// @notice Claims tickets refund in case the game was terminated in emergency.
    function claimTicketsEmergency() external atState(State.EmergencyTerminated) {
        uint256 claim = salesOf[msg.sender];
        require(claim > 0, "Nothing to claim");

        salesOf[msg.sender] = 0;

        emit TicketsClaimedEmergency(msg.sender, claim);

        SafeTransferLib.safeTransferETH(msg.sender, claim);
    }

    /// @dev Chainlink VRF's callback.
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        require(msg.sender == address(VRF_COORDINATOR), "Unauthorized coordinator");

        if (requestId == winnerRequestId) {
            return _setRandomWinner(randomWords[0]);
        }

        if (requestId == centerRequestId) {
            return _setRandomCenter(randomWords[0]);
        }
    }

    /// PUBLIC ///

    function prize(uint256 prizeId) public view returns (Prize memory) {
        require(prizeId > 0 && prizeId <= _prizes.length, "Invalid prize ID");

        return _prizes[prizeId - 1];
    }

    function allBets() public view returns (Bet[] memory) {
        return bets;
    }

    function wonPrize() public view returns (Prize memory) {
        return prize(winningBet.prizeId);
    }

    function isReferralValid(address referral) public view returns (bool) {
        if (referral != address(0)) {

            return true;

            //uint256 totalInvested = salesOf[referral];

            //totalInvested += investmentOf[referral];

            //return (totalInvested >= REFERRAL_THRESHOLD);
        }

        return false;
    }

    function isClaimInvestmentAllowed() public view returns (bool) {
        return state == State.FundsWithdrawn;
    }

    function isInvestmentAllowed() public view returns (bool) {
        return state == State.Initial;
    }

    function isFinishGameExecuted() public view returns (bool) {
        return state == State.RandomCoordinatesExecuted || state == State.FindWinnerExecuted
            || state == State.WinnerFound || state == State.FundsWithdrawn;
    }

    function isWinnerFound() public view returns (bool) {
        return state == State.WinnerFound || state == State.FundsWithdrawn;
    }

    function isPlacingBetsAllowed() public view returns (bool) {
        if (state == State.Initial) {
            return true;
        }

        if (state == State.InvestmentReached) {
            return endTimestamp > block.timestamp;
        }

        return false;
    }

    function isGameTerminated() public view returns (bool) {
        return state == State.EmergencyTerminated;
    }

    /// INTERNAL ///

    function _setRandomCenter(uint256 random) internal {
        uint256 xShift = random % CENTER_RANGE;
        uint256 yShift = (random >> 16) % CENTER_RANGE;

        if (xShift >= CENTER_MAX_SHIFT) {
            xShift -= CENTER_MAX_SHIFT;
            centerX = ((commitX + xShift) > MAX_X) ? MAX_X : (commitX + xShift);
        } else {
            centerX = (commitX < xShift) ? 0 : (commitX - xShift);
        }

        if (yShift >= CENTER_MAX_SHIFT) {
            yShift -= CENTER_MAX_SHIFT;
            centerY = ((commitY + yShift) > MAX_Y) ? MAX_Y : (commitY + yShift);
        } else {
            centerY = (commitY < yShift) ? 0 : (commitY - yShift);
        }

        state = State.RandomCoordinatesExecuted;

        emit BallPositionFound(centerX, centerY);
    }

    function _setRandomWinner(uint256 random) private {
        winningBet = bets[closestBetIds[random % closestBetIds.length]];

        state = State.WinnerFound;

        emit WinningBetFound(winningBet);
    }
}
