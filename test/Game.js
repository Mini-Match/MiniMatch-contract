const { ethers } = require('hardhat');
const {
    expect,
    collections,
    IMAGE_MAX_X,
    IMAGE_MAX_Y,
    MAX_TICKETS_PER_PLAYER,
    maxPrice,
    calculateWinners,
    calculateCommit,
    formatBalance,
    decimals,
    calculatePaymentForBets,
    calculateWinnersIndexes
} = require('../env.js');

describe('Game flow test (Simulation: nft winner price < ticketSaleFunds)', async () => {
    let manager;
    let player1;
    let player2;
    let managerAddress;
    let player1Address;
    let player2Address;
    let investor1Address;
    let investor2Address;
    let GameContract;
    let VRFCoordinatorV2Mock;
    let randomX;
    let randomY;
    let ERC20Contract;
    const initialSupply = ethers.utils.parseUnits('100000000', decimals); // 100m. +6 decimals
    const investedAmountBelowMax = maxPrice.div(2);
    const investedAmountAboveMax = maxPrice.mul(2);
    const TIME_AFTER_FUNDED = 3600 * 24 * 7;
    const CENTER_MAX_SHIFT = 204;
    const INVESTORS_PERCENT_DISTRIBUTION = 60;

    const correctTestBets = [
        {
            couponCode: ethers.constants.HashZero,
            player: ethers.constants.AddressZero,
            prizeId: 1,
            x: 2,
            y: 4,
        },
        {
            couponCode: ethers.constants.HashZero,
            player: ethers.constants.AddressZero,
            prizeId: 2,
            x: 20,
            y: 245,
        },
    ];

    it("Deploy contracts", async () => {
        [manager, player1, player2, investor1, investor2] = await ethers.getSigners();
        player1Address = await player1.getAddress();
        player2Address = await player2.getAddress();
        investor1Address = await investor1.getAddress();
        investor2Address = await investor2.getAddress();
        managerAddress = await manager.getAddress();
        randomX = ethers.BigNumber.from(Math.floor(Math.random() * IMAGE_MAX_X));
        randomY = ethers.BigNumber.from(Math.floor(Math.random() * IMAGE_MAX_Y));
        const commit = calculateCommit(randomX, randomY);

        // deployment of chainlink mock for testing purposes
        const BASE_FEE = "250000000000000000" // 0.25 is this the premium in LINK
        const GAS_PRICE_LINK = 1e9 // link per gas // 0.000000001 LINK per gas
        const KEY_HASH = '0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc';
        const fundAmount = "1000000000000000000"; // 1 LINK coins

        VRFCoordinatorV2Mock = await (await ethers.getContractFactory('VRFCoordinatorV2Mock'))
        .connect(manager)
        .deploy(BASE_FEE, GAS_PRICE_LINK);

        const tx = await VRFCoordinatorV2Mock.connect(manager).createSubscription();
        const receipt = await tx.wait();
        const subsId = ethers.BigNumber.from(receipt.events[0].topics[1]);
        await VRFCoordinatorV2Mock.fundSubscription(subsId, fundAmount);

        ERC20Contract = await (await ethers.getContractFactory('SampleTokenERC20'))
        .connect(manager)
        .deploy("Token", "TKN", initialSupply);

        GameContract = await (await ethers.getContractFactory('WagmiCompetition'))
        .connect(manager)
        .deploy(VRFCoordinatorV2Mock.address, KEY_HASH, ERC20Contract.address, commit, subsId, collections, maxPrice);

        await ERC20Contract.connect(manager).approve(GameContract.address, ethers.constants.MaxUint256);
        await ERC20Contract.connect(player1).approve(GameContract.address, ethers.constants.MaxUint256);
        await ERC20Contract.connect(player2).approve(GameContract.address, ethers.constants.MaxUint256);
        await ERC20Contract.connect(investor1).approve(GameContract.address, ethers.constants.MaxUint256);
        await ERC20Contract.connect(investor2).approve(GameContract.address, ethers.constants.MaxUint256);

        await ERC20Contract.connect(manager).transfer(player1Address, initialSupply.div(5));
        await ERC20Contract.connect(manager).transfer(player2Address, initialSupply.div(5));
        await ERC20Contract.connect(manager).transfer(investor1Address, initialSupply.div(5));
        await ERC20Contract.connect(manager).transfer(investor2Address, initialSupply.div(5));

        const investor1Balance = await ERC20Contract.balanceOf(investor1Address);
        const investor2Balance = await ERC20Contract.balanceOf(investor2Address);
        const houseBalance = await ERC20Contract.balanceOf(managerAddress);
        console.log("Max price for simulation:", formatBalance(maxPrice));
        console.log("House balance", formatBalance(houseBalance));
        console.log("Investor1 balance", formatBalance(investor1Balance));
        console.log("Investor2 balance", formatBalance(investor2Balance));
    });

    it("Successful invest before reaching max cap", async () => {
        const tx = await GameContract.connect(investor1).invest(investedAmountBelowMax);
        await expect(tx).to.emit(GameContract, 'Invested').withArgs(investor1Address, investedAmountBelowMax);
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount).to.eq(investedAmountBelowMax);
    });

    it("Pause game can be done only by owner", async () => {
        await expect(
            GameContract.connect(player1).setIsPaused(true)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Game paused", async () => {
        const tx = await GameContract.connect(manager).setIsPaused(true);
        await expect(tx).to.emit(GameContract, 'Paused').withArgs(managerAddress);
    });

    it("Investment denied because of the game paused", async () => {
        await expect(
            GameContract.connect(player1).invest(ethers.constants.One)
        ).to.be.revertedWith("Pausable: paused");
    });

    it("placeBets denied because of the game paused", async () => {
        await expect(
            GameContract.connect(player1).placeBets(correctTestBets, ethers.constants.AddressZero)
        ).to.be.revertedWith("Pausable: paused");
    });

    it("Game unpaused", async () => {
        const tx = await GameContract.connect(manager).setIsPaused(false);
        await expect(tx).to.emit(GameContract, 'Unpaused').withArgs(managerAddress);
    });

    it("Place bets before reaching max cap", async () => {
        const payment = calculatePaymentForBets(correctTestBets);
        const tx = await GameContract.connect(player2).placeBets(correctTestBets, ethers.constants.AddressZero);

        for (const bet of correctTestBets) {
            await expect(tx).to.emit(GameContract, 'BetPlaced').withArgs(player2Address, bet.prizeId, bet.x, bet.y);
        }

        await expect(tx).to.emit(GameContract, 'TotalBetPlaced').withArgs(player2Address, correctTestBets.length);

        const ticketSaleFunds = await GameContract.totalSales();
        expect(ticketSaleFunds).to.eq(payment);

        const isInvestmentAllowed = await GameContract.isInvestmentAllowed();
        expect(isInvestmentAllowed).to.be.true;

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.true;
    });

    it("Game cannot be finished if investment goal is not reached", async () => {
        await expect(
            GameContract.connect(manager).finishGame(randomX, randomY)
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Successful invest with reaching max cap", async () => {
        await GameContract.connect(investor2).invest(investedAmountAboveMax);

        const ticketSaleFunds = await GameContract.totalSales();
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount.add(ticketSaleFunds)).to.be.above(maxPrice);
    });

    it("Game cannot be stopped until 7 days timeout passes", async () => {
        await expect(
            GameContract.connect(manager).finishGame(randomX, randomY)
        ).to.be.revertedWith("Finish game after timeout only");

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.true;
    });

    it("Investment denied because of max cap reached", async () => {
        await expect(
            GameContract.connect(player1).invest(ethers.constants.One)
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Place bets after reaching max cap is still allowed", async () => {
        const payment = calculatePaymentForBets(correctTestBets);
        const tx = await GameContract.connect(player1).placeBets(correctTestBets, ethers.constants.AddressZero);

        for (const bet of correctTestBets) {
            await expect(tx).to.emit(GameContract, 'BetPlaced').withArgs(player1Address, bet.prizeId, bet.x, bet.y);
        }

        const ticketSaleFunds = await GameContract.totalSales();
        expect(ticketSaleFunds).to.eq(payment.add(payment));

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.true;
    });

    it("placeBets. Invalid coordinates", async () => {
        let incorrectBets1 = [...correctTestBets];
        let betSample1 = {...correctTestBets[0]};
        betSample1.x = IMAGE_MAX_X + 1;
        incorrectBets1.push(betSample1);

        await expect(
            GameContract.connect(player1).placeBets(incorrectBets1, ethers.constants.AddressZero)
        ).to.be.revertedWith("X > max");

        let incorrectBets2 = [...correctTestBets];
        let betSample2 = {...correctTestBets[0]};
        betSample2.y = IMAGE_MAX_Y + 1;
        incorrectBets2.push(betSample2);

        await expect(
            GameContract.connect(player1).placeBets(incorrectBets2, ethers.constants.AddressZero)
        ).to.be.revertedWith("Y > max");

        let incorrectBets3 = [...correctTestBets];
        let betSample3 = {...correctTestBets[0]};
        betSample3.x = 0;
        betSample3.y = 0;
        incorrectBets3.push(betSample3);

        await expect(
            GameContract.connect(player1).placeBets(incorrectBets3, ethers.constants.AddressZero)
        ).to.be.revertedWith("x == 0 && y == 0");
    });

    it("placeBets. zero bets made", async () => {
        await expect(
            GameContract.connect(player1).placeBets([], ethers.constants.AddressZero)
        ).to.be.revertedWith("At least 1 bet required");
    });

    it("placeBets. non existing prize ID", async () => {
        let incorrectBets = [...correctTestBets];
        let betSample = {...correctTestBets[0]};
        betSample.prizeId = collections.length;
        incorrectBets.push(betSample);

        await expect(
            GameContract.connect(player1).placeBets(incorrectBets, ethers.constants.AddressZero)
        ).to.be.revertedWith("Invalid prize ID");
    });

    it("placeBets. Too many bets per player", async () => {
        const totalTicketsPerPlayer = await GameContract.ticketsOf(player1Address);
        const currentNumberOfBetsPerPlayer = Number(totalTicketsPerPlayer.toString());

        let tooManyBets = [];
        for(let i = 0; i < (MAX_TICKETS_PER_PLAYER - currentNumberOfBetsPerPlayer + 1); i++) {
            tooManyBets.push(correctTestBets[0])
        }

        await expect(
            GameContract.connect(player1).placeBets(tooManyBets, ethers.constants.AddressZero)
        ).to.be.revertedWith("Too many bets");
    });

    it("Place bets cannot be done after 7 days", async () => {
        await network.provider.send("evm_increaseTime", [TIME_AFTER_FUNDED]);
        await network.provider.send("evm_mine");

        await expect(
            GameContract.connect(manager).placeBets(correctTestBets, ethers.constants.AddressZero)
        ).to.be.revertedWith("Game stopped after timeout");

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.false;
    });

    it("get all bets", async () => {
        const allBets = await GameContract.allBets();
        allBets.forEach(element => {
            console.log(
                "player:", element.player.toString(),
                "prizeId:", element.prizeId.toString(),
                "x:", element.x.toString(),
                "y:", element.y.toString()
            );
        });
        expect(allBets.length).to.eq(correctTestBets.length * 2);

        let dict = {};
        allBets.forEach(element => {
            const player = element.player.toString();
            if (player in dict) {
                dict[player] += 1;
            } else {
                dict[player] = 1;
            }
        });

        expect(dict[player2Address]).to.eq(correctTestBets.length);
        expect(dict[player1Address]).to.eq(correctTestBets.length);
    });

    it("Finish game can be done only by the owner", async () => {
        await expect(
            GameContract.connect(player1).finishGame(randomX, randomY)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Finish game commit does not match reveal", async () => {
        const tempRandomX = (Math.random() * IMAGE_MAX_X).toFixed();
        const tempRandomY = (Math.random() * IMAGE_MAX_Y).toFixed();
        await expect(
            GameContract.connect(manager).finishGame(tempRandomX, tempRandomY)
        ).to.be.revertedWith("Commit does not match");
    });

    it("Find winner cannot be called before game finished", async () => {
        let winners = [];
        await expect(
            GameContract.connect(manager).findWinner(winners)
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Finish game", async () => {
        let isFinishGameExecuted = await GameContract.isFinishGameExecuted();
        expect(isFinishGameExecuted).to.be.false;

        const tx = await GameContract.connect(manager).finishGame(randomX, randomY);
        const ticketSaleFunds = await GameContract.totalSales();
        const investmentFunds = await GameContract.totalInvestment();
        await expect(tx).to.emit(GameContract, 'GameFinished').withArgs(investmentFunds, ticketSaleFunds);
        await expect(tx).to.emit(VRFCoordinatorV2Mock,"RandomWordsRequested");

        const commitBallX  = await GameContract.commitX();
        const commitBallY  = await GameContract.commitY();
        const allBets = await GameContract.allBets();

        const winners = calculateWinners(allBets, commitBallX, commitBallY);
        expect(winners.length).to.eq(2); // player1 + player2 but bet coordinates are the same

        // simulate chainlonk VRF call
        const _ballRandomRequestId = 1; // hardcoding here. it is fine for test purposes
        const simulateChainlinkTx = await VRFCoordinatorV2Mock.fulfillRandomWords(_ballRandomRequestId, GameContract.address);
        await expect(simulateChainlinkTx).to.emit(GameContract, "BallPositionFound");

        const finalBallX  = await GameContract.centerX();
        const finalBallY  = await GameContract.centerY();

        expect(finalBallX).to.be.within(commitBallX.sub(CENTER_MAX_SHIFT), commitBallX.add(CENTER_MAX_SHIFT));
        expect(finalBallY).to.be.within(commitBallY.sub(CENTER_MAX_SHIFT), commitBallY.add(CENTER_MAX_SHIFT));

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.false;

        isFinishGameExecuted = await GameContract.isFinishGameExecuted();
        expect(isFinishGameExecuted).to.be.true;
    });

    it("Game cannot be finished 2 times", async () => {
        await expect(
            GameContract.connect(manager).finishGame(randomX, randomY)
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Find winner cannot be called with empty candidates parameter", async () => {
        let winners = [];
        await expect(
            GameContract.connect(manager).findWinner(winners)
        ).to.be.revertedWith("At least 1 candidate required");
    });

    it("Find winner can be called only by the owner", async () => {
        let winners = [];
        await expect(
            GameContract.connect(player1).findWinner(winners)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Find winner", async () => {
        let isWinnerFound = await GameContract.isWinnerFound();
        expect(isWinnerFound).to.be.false;

        const finalBallX  = await GameContract.centerX();
        const finalBallY  = await GameContract.centerY();
        const allBets = await GameContract.allBets();
        const winners = calculateWinnersIndexes(allBets, finalBallX, finalBallY);
        expect(winners.length).to.eq(2); // player1 + player2 but bet coordinates are the same

        const tx = await GameContract.connect(manager).findWinner(winners);
        await expect(tx).to.emit(VRFCoordinatorV2Mock, "RandomWordsRequested");

        const _winnerRandomRequestId = 2; // hardcoding here. it is fine for test purposes
        const simulateChainlinkTx = await VRFCoordinatorV2Mock.fulfillRandomWords(_winnerRandomRequestId, GameContract.address);
        await expect(simulateChainlinkTx).to.emit(GameContract, "WinningBetFound");

        const winningBetContract = await GameContract.winningBet();
        const wonPrizeContract = await GameContract.wonPrize();
        const winningBet = allBets[3];
        const wonPrize = collections[winningBet.prizeId - 1];

        expect(wonPrize.price).to.eq(wonPrizeContract.price);
        expect(wonPrize.ticketPrice).to.eq(wonPrizeContract.ticketPrice);

        expect(winningBetContract.prizeId).to.eq(winningBet.prizeId);
        expect(winningBetContract.player).to.eq(winningBet.player);
        expect(winningBetContract.x).to.eq(winningBet.x);
        expect(winningBetContract.y).to.eq(winningBet.y);

        isWinnerFound = await GameContract.isWinnerFound();
        expect(isWinnerFound).to.be.true;
    });

    it("Find winner cannot be called second time since winner has been already found", async () => {
        let winners = [];
        await expect(
            GameContract.connect(manager).findWinner(winners)
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Withdraw is possible only by the house", async () => {
        const wonPrize = await GameContract.wonPrize();
        await expect(
            GameContract.connect(player1).withdrawPrizePurchaseFunds(wonPrize.price)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Claim of any investment cannot be done before house executes withdrawPrizePurchaseFunds", async () => {
        await expect(
            GameContract.connect(player1).claimInvestment()
        ).to.be.revertedWith("Inappropriate state");

        const isClaimInvestmentAllowed = await GameContract.isClaimInvestmentAllowed();
        expect(isClaimInvestmentAllowed).to.be.false;
    });

    it("Withdraw by house (ntf market price is bigger than defined one)", async () => {
        const wonPrize = await GameContract.wonPrize();
        // simulate market price to be bigger than the defined one
        // then the contract has limited only to the defined one
        const tx = await GameContract.connect(manager).withdrawPrizePurchaseFunds(wonPrize.price.add(1000));
        const totalInvestedAmount = await GameContract.totalInvestment();
        const ticketSaleFunds = await GameContract.totalSales();

        // investmentorProftAfterProportion = (sales - wonPrize) * 60% * (totalInvestedAmount/(maxPrice))
        const investmentorProftAfterProportion =
        ticketSaleFunds.
        sub(wonPrize.price).
        mul(INVESTORS_PERCENT_DISTRIBUTION).
        mul(totalInvestedAmount).
        div(maxPrice).
        div(100);

        const houseProfit = ticketSaleFunds.sub(wonPrize.price).sub(investmentorProftAfterProportion);
        console.log("Total investment funds", formatBalance(totalInvestedAmount));
        console.log("Total sales funds", formatBalance(ticketSaleFunds));
        console.log("Nft winner price", formatBalance(wonPrize.price));
        console.log("House profit", formatBalance(houseProfit));
        console.log("Investors profit", formatBalance(investmentorProftAfterProportion));

        console.log(formatBalance(wonPrize.price));
        console.log(formatBalance(houseProfit));

        await expect(tx).to.emit(GameContract, 'PurchasePrizeFundsWitdhrawn').withArgs(wonPrize.price, houseProfit);

        const investmentDistribution = await GameContract.claimableInvestment();
        expect(investmentDistribution).to.eq(investmentorProftAfterProportion.add(totalInvestedAmount));

        const isClaimInvestmentAllowed = await GameContract.isClaimInvestmentAllowed();
        expect(isClaimInvestmentAllowed).to.be.true;
    });

    it("Withdraw by the house cannod be done second time", async () => {
        const wonPrize = await GameContract.wonPrize();
        await expect(
            GameContract.connect(manager).withdrawPrizePurchaseFunds(wonPrize.price)
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Claim investment by investor1", async () => {
        const investmentDistribution = await GameContract.claimableInvestment();
        const totalInvestedAmount = await GameContract.totalInvestment();
        const profit = investmentDistribution.mul(investedAmountBelowMax).div(totalInvestedAmount);

        console.log("Total investment funds", formatBalance(totalInvestedAmount));
        console.log("Investment funds made by investor", formatBalance(investedAmountBelowMax));
        console.log("Investor's pool share", investedAmountBelowMax.mul(100).div(totalInvestedAmount).toString(),"%");
        console.log("Investor's claimed funds", formatBalance(profit));

        const tx = await GameContract.connect(investor1).claimInvestment();
        await expect(tx).to.emit(GameContract, 'InvestmentClaimed').withArgs(investor1Address, profit);
    });

    it("Nothing to claim second time", async () => {
        await expect(
            GameContract.connect(investor1).claimInvestment()
        ).to.be.revertedWith("Nothing to claim");
    });

    it("Claim investment by investor2", async () => {
        const investmentDistribution = await GameContract.claimableInvestment();
        const totalInvestedAmount = await GameContract.totalInvestment();
        const investedAmountByInvestor = await GameContract.investmentOf(investor2Address);
        const profit = investmentDistribution.mul(investedAmountByInvestor).div(totalInvestedAmount);

        console.log("Total investment funds", formatBalance(totalInvestedAmount));
        console.log("Investment funds made by investor", formatBalance(investedAmountByInvestor));
        console.log("Investor's pool share", investedAmountByInvestor.mul(100).div(totalInvestedAmount).toString(),"%");
        console.log("Investor's claimed funds", formatBalance(profit));

        await expect(
            GameContract.connect(investor2).claimInvestment()
        ).to.be.revertedWith("Nothing to claim");
    });

    it("Contract balance is empty after all investor claimed and house withdrew", async () => {
        const contractBalance = await ERC20Contract.balanceOf(GameContract.address);
        const investor1Balance = await ERC20Contract.balanceOf(investor1Address);
        const investor2Balance = await ERC20Contract.balanceOf(investor2Address);
        const houseBalance = await ERC20Contract.balanceOf(managerAddress);

        console.log("House balance", formatBalance(houseBalance));
        console.log("Contract balance", formatBalance(contractBalance));
        console.log("Investor1 balance", formatBalance(investor1Balance));
        console.log("Investor2 balance", formatBalance(investor2Balance));

        // ethers.constants.One is 1 wei. It is normal and maximal possible precision loss of integer division.
        expect(contractBalance).to.within(0, ethers.constants.One);
    });
});
