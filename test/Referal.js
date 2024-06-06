const {
    expect,
    collections,
    IMAGE_MAX_X,
    IMAGE_MAX_Y,
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
    const REFERAL_TRESHOLD_DOLLARS = 100;
    const REFERAL_DISCOUNT_PERCENT = 5;
    const REFERAL_REWARDS_PERCENT = 20;

    const DIFFERENCE_DOLLARS = 1;
    const initialSupply = ethers.utils.parseUnits('100000000', decimals); // 100m. +6 decimals
    const maxPrice = ethers.utils.parseUnits((REFERAL_TRESHOLD_DOLLARS*2).toString(), decimals);
    collections[0].price = maxPrice;
    collections[0].ticketPrice = ethers.utils.parseUnits('30', decimals); // 30$ 
    collections[1].ticketPrice = ethers.utils.parseUnits('5', decimals);  // 5$ 

    const investedAmountBeforeReferalLimit = ethers.utils.parseUnits((REFERAL_TRESHOLD_DOLLARS - DIFFERENCE_DOLLARS).toString(), decimals);
    const investedAmountToReachReferalLimit = ethers.utils.parseUnits((DIFFERENCE_DOLLARS).toString(), decimals);

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
        console.log("House balance", formatBalance(houseBalance));
        console.log("Investor balance", formatBalance(investorBalance));
    });

    it("Referal and referee cannot be the same", async () => {
        const payment = calculatePaymentForBets(correctTestBets);

        await expect(
            GameContract.connect(player).placeBets(correctTestBets, playerAddress)
        ).to.be.revertedWith("Referal and referee cannot be the same");
    });

    it("Place bets before reaching max cap (zero address referal)", async () => {
        const playerBalanceBefore = await ERC20Contract.balanceOf(playerAddress);

        const payment = calculatePaymentForBets(correctTestBets);
        await GameContract.connect(player).placeBets(correctTestBets, ethers.constants.AddressZero);

        const isInvestorGoodReferal = await GameContract.isReferralValid(investorAddress);
        expect(isInvestorGoodReferal).to.be.false;

        const isPlayerGoodReferal = await GameContract.isReferralValid(playerAddress);
        expect(isPlayerGoodReferal).to.be.false;

        const playerBalanceAfter = await ERC20Contract.balanceOf(playerAddress);
        expect(playerBalanceAfter.add(payment)).to.eq(playerBalanceBefore);
    });

    it("invest before reaching referal elligibility", async () => {
        const tx = await GameContract.connect(investor).invest(investedAmountBeforeReferalLimit);
        await expect(tx).to.emit(GameContract, 'Invested').withArgs(investorAddress, investedAmountBeforeReferalLimit);
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount).to.eq(investedAmountBeforeReferalLimit);

        const isInvestorGoodReferal = await GameContract.isReferralValid(investorAddress);
        expect(isInvestorGoodReferal).to.be.false;
    });

    it("Place bets before reaching max cap (referal not accepted)", async () => {
        const payment = calculatePaymentForBets(correctTestBets);
        const playerBalanceBefore = await ERC20Contract.balanceOf(playerAddress);
        const referalBalanceBefore = await ERC20Contract.balanceOf(investorAddress);

        await GameContract.connect(player).placeBets(correctTestBets, investorAddress);

        const referalBalanceAfter = await ERC20Contract.balanceOf(investorAddress);
        expect(referalBalanceBefore).to.eq(referalBalanceAfter);

        const isInvestorGoodReferal = await GameContract.isReferralValid(investorAddress);
        expect(isInvestorGoodReferal).to.be.false;

        const isPlayerGoodReferal = await GameContract.isReferralValid(playerAddress);
        expect(isPlayerGoodReferal).to.be.false;

        const playerBalanceAfter = await ERC20Contract.balanceOf(playerAddress);
        expect(playerBalanceAfter.add(payment)).to.eq(playerBalanceBefore);
    });

    it("invest the rest to reach referal elligibility", async () => {
        const tx = await GameContract.connect(investor).invest(investedAmountToReachReferalLimit);
        await expect(tx).to.emit(GameContract, 'Invested').withArgs(investorAddress, investedAmountToReachReferalLimit);
        const totalInvestedAmount = await GameContract.totalInvestment();
        expect(totalInvestedAmount).to.eq(investedAmountToReachReferalLimit.add(investedAmountBeforeReferalLimit));

        const isInvestorGoodReferal = await GameContract.isReferralValid(investorAddress);
        expect(isInvestorGoodReferal).to.be.true;
    });

    it("placeBets. (refera accepted) but small payment", async () => {
        const payment = calculatePaymentForBets(correctTestBets);

        await expect(
            GameContract.connect(player).placeBets(correctTestBets.sub(1), investorAddress)
        ).to.be.revertedWith("Too small value");
    });

    it("Place bets. Referal investor now accepted", async () => {
        const payment = calculatePaymentForBets(correctTestBets);
        console.log(payment.toString())
        const paymentWithDiscount = payment.mul(100 - REFERAL_DISCOUNT_PERCENT).div(100);

        const referalBalanceBefore = await ERC20Contract.balanceOf(investorAddress);
        const playerBalanceBefore = await ERC20Contract.balanceOf(playerAddress);
        const referalReward = payment.mul(REFERAL_REWARDS_PERCENT).div(100);

        const tx = await GameContract.connect(player).placeBets(correctTestBets, investorAddress);
        await expect(tx).to.emit(GameContract, 'ReferralRewarded').withArgs(investorAddress, playerAddress, referalReward);

        const referalBalanceAfter = await ERC20Contract.balanceOf(investorAddress);
        expect(referalBalanceBefore.add(referalReward)).to.eq(referalBalanceAfter);

        const isInvestorGoodReferal = await GameContract.isReferralValid(investorAddress);
        expect(isInvestorGoodReferal).to.be.true;

        const isPlayerGoodReferal = await GameContract.isReferralValid(playerAddress);
        expect(isPlayerGoodReferal).to.be.true;

        const playerBalanceAfter = await ERC20Contract.balanceOf(playerAddress);
        expect(playerBalanceAfter.add(paymentWithDiscount)).to.eq(playerBalanceBefore);
    });

    it("Place bets. Referal player now accepted", async () => {
        const payment = calculatePaymentForBets(correctTestBets);
        const paymentWithDiscount = payment.mul(100 - REFERAL_DISCOUNT_PERCENT).div(100);

        const playerBalanceBefore = await ERC20Contract.balanceOf(investorAddress);
        const referalBalanceBefore  = await ERC20Contract.balanceOf(playerAddress);
        const referalReward = payment.mul(REFERAL_REWARDS_PERCENT).div(100);

        const tx = await GameContract.connect(investor).placeBets(correctTestBets, playerAddress);
        await expect(tx).to.emit(GameContract, 'ReferralRewarded').withArgs(playerAddress, investorAddress, referalReward);

        const referalBalanceAfter = await ERC20Contract.balanceOf(playerAddress);
        expect(referalBalanceBefore.add(referalReward)).to.eq(referalBalanceAfter);

        const isInvestorGoodReferal = await GameContract.isReferralValid(investorAddress);
        expect(isInvestorGoodReferal).to.be.true;

        const isPlayerGoodReferal = await GameContract.isReferralValid(playerAddress);
        expect(isPlayerGoodReferal).to.be.true;

        const playerBalanceAfter = await ERC20Contract.balanceOf(investorAddress);
        expect(playerBalanceAfter.add(paymentWithDiscount)).to.eq(playerBalanceBefore);
    });
});
