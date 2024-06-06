const initialSupply = ethers.utils.parseEther('100000000'); // 100m. +18 decimals
const { formatBalance } = require('../env.js');

module.exports = async ({
  getNamedAccounts,
  deployments,
  getChainId,
}) => {
  const { deploy } = deployments;
  const { manager, player1, player2 } = await getNamedAccounts();
  const chainId = await getChainId();
  console.log(
    "Starting deployment to",
    chainId,
    "network",
    "(",
    hre.network.name,
    ")"
  );
  console.log("Deployer account (Token owner):", manager);

  //console.log(hre);

  const { receipt } = await deploy("SampleTokenERC20", {
    // name of deployment file to be saved
    from: manager,
    skipIfAlreadyDeployed: true, // this contract is deployed once only
    contract: "SampleTokenERC20", // name in artifacts
    args: ["Token", "TKN", initialSupply],
    gasLimit: 4000000,
  });

  console.log("Token address:", receipt.contractAddress);
  console.log("Total supply:", formatBalance(initialSupply));
  console.log("Gas used:", receipt.gasUsed?.toString());

  const deployment = await deployments.getOrNull("SampleTokenERC20");
  if (deployment === undefined) {
    throw "Deployment does not exist";
  }

  const tokenContract = new ethers.Contract(
    deployment.address,
    deployment.abi,
    ethers.provider
  );
  const owner = await ethers.getSigner(manager);

  let transactionReceipt = await tokenContract
    .connect(owner)
    .transfer(player1, initialSupply.div(3));
  let rcpt = await transactionReceipt.wait();

  transactionReceipt = await tokenContract
    .connect(owner)
    .transfer(player2, initialSupply.div(3));
  rcpt = await transactionReceipt.wait();

  const newDeployerBalance = await tokenContract.balanceOf(manager);
  const newUser1Balance = await tokenContract.balanceOf(player1);
  const newUser2Balance = await tokenContract.balanceOf(player2);

  console.log(
    "Account:",
    manager,
    "has token balance:",
    formatBalance(newDeployerBalance)
  );
  console.log(
    "Account:",
    player1,
    "has token balance:",
    formatBalance(newUser1Balance)
  );
  console.log(
    "Account:",
    player2,
    "has token balance:",
    formatBalance(newUser2Balance)
  );
};

module.exports.tags = ['SampleToken']; // later can use for selective deployment
module.exports.skip = function(HardhatRuntimeEnvironment) {
  // This deplyment script is only for live network to connect to L2, so skipping it for localhost and hardhat networks
  console.log(HardhatRuntimeEnvironment.network.name, "is", HardhatRuntimeEnvironment.network.live ? "a": "not" , "live network");
  return !HardhatRuntimeEnvironment.network.live;
}
