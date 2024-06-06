const {
  gameDesignParameters,
  subscriptionId,
  collections,
  calculateCommit,
  getRandomCommitCoordinate,
  x,
  y,
  maxPrice,
  IMAGE_MAX_X,
  IMAGE_MAX_Y,
  referralThreshold,
} = require("../env.js");

module.exports = async ({
  getNamedAccounts,
  deployments,
  getChainId,
  getUnnamedAccounts,
}) => {
  const { deploy, getOrNull } = deployments;
  const { manager } = await getNamedAccounts();
  const chainId = await getChainId();
  console.log(
    "Starting deployment to",
    chainId,
    "network",
    "(",
    hre.network.name,
    ")"
  );

  // Chainlink config
  // see https://docs.chain.link/docs/vrf-contracts/#configurations

  let VRF_COORDINATOR;
  let KEY_HASH;
  let ERC20DeploymentAddress = process.env.TOKEN_ADDRESS;

  if (hre.network.name === "rinkeby") {
    VRF_COORDINATOR = "0x6168499c0cFfCaCD319c818142124B7A15E857ab";
    KEY_HASH =
      "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc";
  }

  if (hre.network.name === "goerli") {
    VRF_COORDINATOR = "0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D";
    KEY_HASH =
      "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15";
    const ERC20Deployment = await getOrNull("SampleTokenERC20");
    if (ERC20Deployment === undefined) {
      //throw "SampleTokenERC20 deployment does not exist";
    }
    ERC20DeploymentAddress = ERC20Deployment?.address;
  }

  if (hre.network.name === "polygon_testnet") {
    VRF_COORDINATOR = "0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed";
    KEY_HASH =
      "0x4b09e658ed251bcafeebbc69400383d49f344ace09b9576fe248bb02c003fe9f";
    const ERC20Deployment = await getOrNull("SampleTokenERC20");
    if (ERC20Deployment === undefined) {
      //throw "SampleTokenERC20 deployment does not exist";
    }
    ERC20DeploymentAddress = ERC20Deployment?.address;
  }

  if (hre.network.name === "polygon") {
    VRF_COORDINATOR = "0xAE975071Be8F8eE67addBC1A82488F1C24858067";
    KEY_HASH =
      "0xcc294a196eeeb44da2888d17c0625cc88d70d9760a69d58d853ba6581a9ab0cd";
    ERC20DeploymentAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  }

  if (hre.network.name === "bsc") {
    VRF_COORDINATOR = "0xc587d9053cd1118f25F645F9E08BB98c9712A4EE";
    KEY_HASH =
      "0xba6e730de88d94a5510ae6613898bfb0c3de5d16e609c5b7da808747125506f7";
    ERC20DeploymentAddress = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  }

  if (hre.network.name === "bsc_testnet") {
    VRF_COORDINATOR = "0x6A2AAd07396B36Fe02a22b33cf443582f682c82f";
    KEY_HASH =
      "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314";
    const ERC20Deployment = await getOrNull("SampleTokenERC20");
    if (ERC20Deployment === undefined) {
      //throw "SampleTokenERC20 deployment does not exist";
    }
    ERC20DeploymentAddress = ERC20Deployment?.address;
  }

  if (hre.network.name === "base_sepolia") {
    VRF_COORDINATOR = "0x99a021029EBC90020B193e111Ae2726264a111A2";
    KEY_HASH =
      "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314";
    ERC20DeploymentAddress = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  }

  if (hre.network.name === "base") {
    VRF_COORDINATOR = "0x73970504Df8290E9A508676a0fbd1B7f4Bcb7f5a";
    KEY_HASH =
      "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314";
    ERC20DeploymentAddress = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  }


  const commitX = getRandomCommitCoordinate(x, IMAGE_MAX_X);
  const commitY = getRandomCommitCoordinate(y, IMAGE_MAX_Y);

  //console.log("ERC20 token:", ERC20DeploymentAddress);
  console.log("Deployer account:", manager);
  console.log("No.Of Collections:", collections.length);
  console.log("Commit X:", commitX.toString());
  console.log("Commit Y:", commitY.toString());

  const commit = calculateCommit(commitX, commitY);
  console.log("Commit hash:", commit);

  const args = [
    VRF_COORDINATOR,
    KEY_HASH,
    //ERC20DeploymentAddress,
    commit,
    subscriptionId,
    collections,
    maxPrice,
    referralThreshold,
    manager
  ];
  const fs = require("fs");
  const toWrite = "module.exports = " + JSON.stringify(args) + ";";
  fs.writeFileSync("arguments.js", toWrite, "utf8");

  gameDesignParameters.commitX = commitX.toString();
  gameDesignParameters.commitY = commitY.toString();
  fs.writeFileSync(
    "gameLogic.json",
    JSON.stringify(gameDesignParameters, undefined, 2),
    "utf8"
  );

  const { receipt } = await deploy("Wagmi", {
    // name of deployment file to be saved
    from: manager,
    skipIfAlreadyDeployed: true, // this contract is deployed once only
    contract: "WagmiCompetition", // name in artifacts
    args: [
      VRF_COORDINATOR,
      KEY_HASH,
      //ERC20DeploymentAddress,
      commit,
      subscriptionId,
      collections,
      maxPrice,
      referralThreshold,
      manager,
    ],
    gasLimit: 4000000,
  });

  console.log("Contract address:", receipt.contractAddress);
  console.log("Gas used for deployment:", receipt.gasUsed.toString());
};

module.exports.tags = ["Main"]; // later can use for selective deployment
module.exports.skip = function (HardhatRuntimeEnvironment) {
  // This deplyment script is only for live network to connect to L2, so skipping it for localhost and hardhat networks
  console.log(
    HardhatRuntimeEnvironment.network.name,
    "is",
    HardhatRuntimeEnvironment.network.live ? "a" : "not",
    "live network"
  );
  return !HardhatRuntimeEnvironment.network.live;
};
