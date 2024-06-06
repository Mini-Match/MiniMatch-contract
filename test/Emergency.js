const {
    expect,
    collections,
    IMAGE_MAX_X,
    IMAGE_MAX_Y,
    maxPrice,
    decimals,
    calculateCommit,
    formatBalance,
    calculatePaymentForBets,
} = require('../env.js');

describe('Emergency case by admin interruption', async () => {
    let manager;
    let player;
    let managerAddress;
    let playerAddress;
    let investorAddress;
    let GameContract;
    let VRFCoordinatorV2Mock;
    let randomX;
    let randomY;
    let ERC20Contract;
    const initialSupply = ethers.utils.parseUnits('100000000', decimals); // 100m. +6 decimals
    const investedAmountBelowMax = maxPrice.div(2);
    const investedAmountAboveMax = maxPrice.mul(2);
    const TIME_AFTER_FUNDED = 3600 * 24 * 7;

    const correctTestBets = [
        {
            player: ethers.constants.AddressZero,
            prizeId: 0,
            x: 2,
            y: 4,
        },
        {
            player: ethers.constants.AddressZero,
            prizeId: 1,
            x: 20,
            y: 245,
        },
    ];

    it("Deploy contracts", async () => {
        [manager, player, investor] = await ethers.getSigners();
        playerAddress = await player.getAddress();
        investorAddress = await investor.getAddress();
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
        await ERC20Contract.connect(investor).approve(GameContract.address, ethers.constants.MaxUint256);

        await ERC20Contract.connect(manager).transfer(playerAddress, initialSupply.div(5));
        await ERC20Contract.connect(manager).transfer(investorAddress, initialSupply.div(5));

        const investorBalance = await ERC20Contract.balanceOf(investorAddress);
        const houseBalance = await ERC20Contract.balanceOf(managerAddress);
        console.log("House initial balance", formatBalance(houseBalance));
        console.log("Investor initial balance", formatBalance(investorBalance));
    });

    it("Successful invest before reaching max cap", async () => {
        const tx = await GameContract.connect(investor).invest(investedAmountBelowMax);
        await expect(tx).to.emit(GameContract, 'Invested').withArgs(investorAddress, investedAmountBelowMax);
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount).to.eq(investedAmountBelowMax);
        console.log("Investor invested", formatBalance(investedAmountBelowMax));
    });

    it("Place bets before reaching max cap", async () => {
        const tx = await GameContract.connect(player).placeBets(correctTestBets, ethers.constants.AddressZero);

        for (const bet of correctTestBets) {
            await expect(tx).to.emit(GameContract, 'BetPlaced').withArgs(playerAddress, bet.prizeId, bet.x, bet.y);
        }

        const ticketSaleFunds = await GameContract.totalSales();
        expect(ticketSaleFunds).to.eq(payment);

        const isInvestmentAllowed = await GameContract.isInvestmentAllowed();
        expect(isInvestmentAllowed).to.be.true;

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.true;
    });

    it("Successful invest with reaching max cap", async () => {
        const ticketSaleFunds = await GameContract.totalSales();
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount.add(ticketSaleFunds)).to.be.above(maxPrice);
        await GameContract.connect(investor).invest(investedAmountAboveMax);
    });

    it("Place bets after reaching max cap is still allowed", async () => {
        const tx = await GameContract.connect(player).placeBets(correctTestBets, ethers.constants.AddressZero);

        for (const bet of correctTestBets) {
            await expect(tx).to.emit(GameContract, 'BetPlaced').withArgs(playerAddress, bet.prizeId, bet.x, bet.y);
        }

        const ticketSaleFunds = await GameContract.totalSales();
        expect(ticketSaleFunds).to.eq(payment.add(payment));

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.true;

        const isGameTerminated = await GameContract.isGameTerminated();
        expect(isGameTerminated).to.be.false;
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

    it("Terminate game can be done only by the owner", async () => {
        await expect(
            GameContract.connect(player).emergencyTerminate()
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Emergency claim by investors can be done only after game terminated", async () => {
        await expect(
            GameContract.connect(investor).claimInvestmentEmergency()
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Emergency claim by players can be done only after game terminated", async () => {
        await expect(
            GameContract.connect(player).claimTicketsEmergency()
        ).to.be.revertedWith("Inappropriate state");
    });

    it("Terminate game", async () => {
        const tx = await GameContract.connect(manager).emergencyTerminate();
        const ticketSaleFunds = await GameContract.totalSales();
        const investmentFunds = await GameContract.totalInvestment();
        await expect(tx).to.emit(GameContract, 'GameTerminated').withArgs(investmentFunds, ticketSaleFunds);

        const isPlacingBetsAllowed = await GameContract.isPlacingBetsAllowed();
        expect(isPlacingBetsAllowed).to.be.false;

        const isGameTerminated = await GameContract.isGameTerminated();
        expect(isGameTerminated).to.be.true;
    });

    it("Claim investment by investor", async () => {
        const totalInvestedAmount = await GameContract.totalInvestment();
        console.log("Total investment funds invested and claimed back", formatBalance(totalInvestedAmount));

        const tx = await GameContract.connect(investor).claimInvestmentEmergency();
        await expect(tx).to.emit(GameContract, 'InvestmentClaimedEmergency').withArgs(investorAddress, totalInvestedAmount);
    });

    it("Claim tickets by player", async () => {
        const totalticketSaleFunds = await GameContract.totalSales();
        console.log("Total sales funds invested and claimed back", formatBalance(totalticketSaleFunds));

        const tx = await GameContract.connect(player).claimTicketsEmergency();
        await expect(tx).to.emit(GameContract, 'TicketsClaimedEmergency').withArgs(playerAddress, totalticketSaleFunds);
    });

    it("Nothing to claim second time by investor", async () => {
        await expect(
            GameContract.connect(investor).claimInvestmentEmergency()
        ).to.be.revertedWith("Nothing to claim");
    });

    it("Nothing to claim second time by player", async () => {
        await expect(
            GameContract.connect(player).claimTicketsEmergency()
        ).to.be.revertedWith("Nothing to claim");
    });
});
