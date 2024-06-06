const { 
    expect,
    collections,
    IMAGE_MAX_X,
    IMAGE_MAX_Y,
    decimals,
    calculateWinners,
    calculateCommit,
    formatBalance,
    calculateWinnersIndexes
} = require('../env.js');

describe('Simulation: extreme case: sales are negligible small comparing to the investments', async () => {
    let manager;
    let player;
    let managerAddress;
    let playerAddress;
    let investor1Address;
    let investor2Address;
    let GameContract;
    let VRFCoordinatorV2Mock;
    let randomX;
    let randomY;
    let ERC20Contract;
    // constants
    const initialSupply = ethers.utils.parseUnits('100000000', decimals); // 100m. +6 decimals
    const BALL_POSITION_MAX_SHIFT = 50;
    const TIME_AFTER_FUNDED = 3600 * 24 * 7;
    // simulation
    const maxPrice = ethers.utils.parseUnits('8000', decimals);
    collections.forEach(element => {
        element.price = maxPrice;
    });
    const simulatedTotalSales = ethers.utils.parseUnits('0.1', decimals);
    const investor1Amount = ethers.utils.parseUnits('2000', decimals);
    const investor2Amount = ethers.utils.parseUnits('6001', decimals);

    it("Deploy contracts", async () => {
        [manager, player, investor1, investor2] = await ethers.getSigners();
        playerAddress = await player.getAddress();
        investor1Address = await investor1.getAddress();
        investor2Address = await investor2.getAddress();
        managerAddress = await manager.getAddress();
        randomX = (Math.random() * IMAGE_MAX_X).toFixed();
        randomY = (Math.random() * IMAGE_MAX_Y).toFixed();
        console.log("Random X:", randomX);
        console.log("Random Y:", randomY);
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
        await ERC20Contract.connect(player).approve(GameContract.address, ethers.constants.MaxUint256);
        await ERC20Contract.connect(investor1).approve(GameContract.address, ethers.constants.MaxUint256);
        await ERC20Contract.connect(investor2).approve(GameContract.address, ethers.constants.MaxUint256);

        await ERC20Contract.connect(manager).transfer(playerAddress, initialSupply.div(4));
        await ERC20Contract.connect(manager).transfer(investor1Address, initialSupply.div(4));
        await ERC20Contract.connect(manager).transfer(investor2Address, initialSupply.div(4));

        const investor1Balance = await ERC20Contract.balanceOf(investor1Address);
        const investor2Balance = await ERC20Contract.balanceOf(investor2Address);
        const houseBalance = await ERC20Contract.balanceOf(managerAddress);
        console.log("Max price for simulation:", formatBalance(maxPrice));
        console.log("House balance", formatBalance(houseBalance));
        console.log("Investor1 balance", formatBalance(investor1Balance));
        console.log("Investor2 balance", formatBalance(investor2Balance));
    });

    it("Investor1 investments", async () => {
        const tx = await GameContract.connect(investor1).invest(investor1Amount);
        await expect(tx).to.emit(GameContract, 'Invested').withArgs(investor1Address, investor1Amount);
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount).to.eq(investor1Amount);
    });

    it("Place bets simulating total sales", async () => {
        const simulationBets = [
            {
                player: ethers.constants.AddressZero,
                prizeId: 1,
                x: 2,
                y: 4,
            }
        ];

        const tx = await GameContract.connect(player).placeBets(simulationBets, ethers.constants.AddressZero);

        for (const bet of simulationBets) {
            await expect(tx).to.emit(GameContract, 'BetPlaced').withArgs(playerAddress, bet.prizeId, bet.x, bet.y);
        }

        const ticketSaleFunds = await GameContract.totalSales();
        expect(ticketSaleFunds).to.eq(simulatedTotalSales);
    });

    it("Investor2 investments", async () => {
        const ticketSaleFunds = await GameContract.totalSales();
        const tx = await GameContract.connect(investor2).invest(investor2Amount);
        await expect(tx).to.emit(GameContract, 'Invested').withArgs(investor2Address, maxPrice.sub(investor1Amount).sub(ticketSaleFunds));
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount).to.eq(maxPrice.sub(ticketSaleFunds));
    });

    it("Finish game", async () => {
        await network.provider.send("evm_increaseTime", [TIME_AFTER_FUNDED]);
        await network.provider.send("evm_mine");
        const tx = await GameContract.connect(manager).finishGame(randomX, randomY);
        const ticketSaleFunds = await GameContract.totalSales();
        const investmentFunds = await GameContract.totalInvestment();
        await expect(tx).to.emit(GameContract, 'GameFinished').withArgs(investmentFunds, ticketSaleFunds);
        await expect(tx).to.emit(VRFCoordinatorV2Mock,"RandomWordsRequested");

        const commitBallX  = await GameContract.commitX();
        const commitBallY  = await GameContract.commitY();
        const allBets = await GameContract.allBets();

        const winners = calculateWinners(allBets, commitBallX, commitBallY);
        expect(winners.length).to.eq(1);

        // simulate chainlonk VRF call
        const _ballRandomRequestId = 1; // hardcoding here. it is fine for test purposes
        const simulateChainlinkTx = await VRFCoordinatorV2Mock.fulfillRandomWords(_ballRandomRequestId, GameContract.address);
        await expect(simulateChainlinkTx).to.emit(GameContract, "BallPositionFound");

        const finalBallX  = await GameContract.centerX();
        const finalBallY  = await GameContract.centerY();

        expect(finalBallX).to.be.within(commitBallX.sub(BALL_POSITION_MAX_SHIFT), commitBallX.add(BALL_POSITION_MAX_SHIFT));
        expect(finalBallY).to.be.within(commitBallY.sub(BALL_POSITION_MAX_SHIFT), commitBallY.add(BALL_POSITION_MAX_SHIFT));
    });

    it("Find winner", async () => {
        const finalBallX  = await GameContract.centerX();
        const finalBallY  = await GameContract.centerY();
        const allBets = await GameContract.allBets();
        const winners = calculateWinnersIndexes(allBets, finalBallX, finalBallY);
        expect(winners.length).to.eq(1);

        const tx = await GameContract.connect(manager).findWinner(winners);
        await expect(tx).to.emit(GameContract, "WinningBetFound");

        const winningBetContract = await GameContract.winningBet();
        const wonPrizeContract = await GameContract.wonPrize();
        const winningBet = allBets[0];
        const wonPrize = collections[winningBet.prizeId];

        expect(wonPrize.collection).to.eq(wonPrizeContract.collection);
        expect(wonPrize.price).to.eq(wonPrizeContract.price);

        expect(winningBetContract.prizeId).to.eq(winningBet.prizeId);
        expect(winningBetContract.player).to.eq(winningBet.player);
        expect(winningBetContract.x).to.eq(winningBet.x);
        expect(winningBetContract.y).to.eq(winningBet.y);
    });

    it("Withdraw by house (ntf market price is equal to the defined one)", async () => {
        let wonPrize = await GameContract.wonPrize();
        wonPrize = wonPrize.price;
        const tx = await GameContract.connect(manager).withdrawPrizePurchaseFunds(wonPrize);
        const totalInvestedAmount = await GameContract.totalInvestment();
        const ticketSaleFunds = await GameContract.totalSales();
        const houseProfit = 0;
        console.log("Total investment funds", formatBalance(totalInvestedAmount));
        console.log("Total sales funds", formatBalance(ticketSaleFunds));
        console.log("Nft winner price", formatBalance(wonPrize));
        console.log("House profit", formatBalance(houseProfit));

        await expect(tx).to.emit(GameContract, 'PurchasePrizeFundsWitdhrawn').withArgs(wonPrize, houseProfit);

        const investmentDistribution = await GameContract.claimableInvestment();
        expect(investmentDistribution).to.eq(totalInvestedAmount.add(ticketSaleFunds).sub(wonPrize));

        console.log("Investors loss", formatBalance(totalInvestedAmount.sub(investmentDistribution)));
    });

    it("Claim investment by investor1", async () => {
        const investmentDistribution = await GameContract.claimableInvestment();
        const totalInvestedAmount = await GameContract.totalInvestment();
        const profit = investmentDistribution.mul(investor1Amount).div(totalInvestedAmount);

        console.log("Total investment funds", formatBalance(totalInvestedAmount));
        console.log("Investment funds made by investor", formatBalance(investor1Amount));
        console.log("Investor's pool share", investor1Amount.mul(100).div(totalInvestedAmount).toString(),"%");
        console.log("Investor's claimed funds", formatBalance(profit));

        const tx = await GameContract.connect(investor1).claimInvestment();
        await expect(tx).to.emit(GameContract, 'InvestmentClaimed').withArgs(investor1Address, profit);
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

        const tx = await GameContract.connect(investor2).claimInvestment();
        await expect(tx).to.emit(GameContract, 'InvestmentClaimed').withArgs(investor2Address, profit);
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
