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
pragma solidity ^0.8.19;

import {ISupraConsumer} from "./ISupraConsumer.sol";

interface IWagmiCompetition is ISupraConsumer {
    /// STRUCTS ///

    struct Prize {
        uint128 price; // The prize estimated market price.
        uint128 ticketPrice; // The ticket price for the prize.
    }

    struct Bet {
        bytes32 couponCode; // The coupon code used to not pay the corresponding ticket price.
        address player; // The player who placed this bet.
        uint32 prizeId; // The prize index in the prizes array.
        uint32 x; // The x coord of the player's guess. Must be < MAX_X.
        uint32 y; // The y coord of the player's guess. Must be < MAX_Y.
    }

    struct Coupon {
        uint128 prizeId;
        uint128 remaining;
    }

    enum State {
        Initial,
        InvestmentReached,
        GameFinished,
        RandomCoordinatesExecuted,
        FindWinnerExecuted,
        WinnerFound,
        FundsWithdrawn,
        EmergencyTerminated
    }

    /// EVENTS ///

    event BallPositionFound(uint256 x, uint256 y);
    event BetPlaced(address indexed player, uint256 prizeId, uint256 x, uint256 y);
    event GameFinished(uint256 investmentOf, uint256 ticketSales);
    event GameTerminated(uint256 investmentOf, uint256 ticketSales);
    event Invested(address indexed investor, uint256 amount);
    event InvestmentClaimed(address indexed investor, uint256 amount);
    event InvestmentClaimedEmergency(address indexed investor, uint256 amount);
    event PurchasePrizeFundsWitdhrawn(uint256 winnerPrice, uint256 houseProfit);
    event ReferralRewarded(address indexed referral, address indexed referee, uint256 reward);
    event TicketsClaimedEmergency(address indexed investor, uint256 amount);
    event TotalBetPlaced(address indexed player, uint256 totalBets);
    event WinningBetFound(Bet bet);

    /// FUNCTIONS ///

    function allBets() external view returns (Bet[] memory);
    function bets(uint256)
        external
        view
        returns (bytes32 couponCode, address player, uint32 prizeId, uint32 x, uint32 y);
    function centerX() external view returns (uint256);
    function centerY() external view returns (uint256);
    function claimInvestment() external;
    function claimInvestmentEmergency() external;
    function claimTicketsEmergency() external;
    function claimableInvestment() external view returns (uint256);
    function closestBetIds(uint256) external view returns (uint256);
    function commitX() external view returns (uint256);
    function commitY() external view returns (uint256);
    function couponFromHash(bytes32) external view returns (uint128 prizeId, uint128 remaining);
    function emergencyTerminate() external;
    function endTimestamp() external view returns (uint256);
    function findWinner(uint256[] memory _closestBetIds) external;
    function finishGame(uint256 x, uint256 y) external;
    function invest() external payable;
    function investmentOf(address) external view returns (uint256);
    function isClaimInvestmentAllowed() external view returns (bool);
    function isFinishGameExecuted() external view returns (bool);
    function isGameTerminated() external view returns (bool);
    function isInvestmentAllowed() external view returns (bool);
    function isPlacingBetsAllowed() external view returns (bool);
    function isReferralValid(address referral) external view returns (bool);
    function isWinnerFound() external view returns (bool);
    function placeBets(Bet[] memory userBets, address referral) external payable;
    function prize(uint256 prizeId) external view returns (Prize memory);
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external;
    function salesOf(address) external view returns (uint256);
    function setCouponPrizeId(bytes32[] memory couponHashes, Coupon[] memory coupons) external;
    function setIsPaused(bool isPaused) external;
    function state() external view returns (State);
    function ticketsOf(address) external view returns (uint256);
    function totalInvestment() external view returns (uint256);
    function totalSales() external view returns (uint256);
    function winningBet()
        external
        view
        returns (bytes32 couponCode, address player, uint32 prizeId, uint32 x, uint32 y);
    function withdrawPrizePurchaseFunds(uint256 amount) external;
    function wonPrize() external view returns (Prize memory);
}
