let chai = require("chai");
const fs = require("fs");

let { solidity } = require("ethereum-waffle");
const { ethers } = require("hardhat");
const gameDesignParameters = JSON.parse(
  fs.readFileSync("gameLogic.json", "utf8")
);
const decimals = 18;
const isNativeCurrency = process.env.NEXT_IS_NATIVE === "yes";
const collections = gameDesignParameters.collections.map((x) => {
  return {
    collection: x.collection,
    price: isNativeCurrency
      ? ethers.utils.parseEther(x.price.toString())
      : ethers.utils.parseUnits(x.price.toString(), decimals),
    ticketPrice: isNativeCurrency
      ? ethers.utils.parseEther(x.ticketPrice.toString())
      : ethers.utils.parseUnits(x.ticketPrice.toString(), decimals),
  };
});

const subscriptionId = gameDesignParameters.subscriptionId;

chai.use(solidity);

expect = chai.expect;

const IMAGE_MAX_X = process.env.NEXT_PUBLIC_IMAGE_MAX_X || 5000;
const IMAGE_MAX_Y = process.env.NEXT_PUBLIC_IMAGE_MAX_Y || 5000;
const MAX_TICKETS_PER_PLAYER = 150;
const referralThreshold = ethers.utils.parseEther(
  process.env.NEXT_REFERRAL_THRESHOLD || "0.01"
);

const maxPrice = collections.reduce(function (max, value) {
  if (value.price.gt(max)) {
    max = value.price;
  }

  return max;
}, ethers.constants.Zero);

function calculateCommit(commitX, commitY) {
  const packedBytes = ethers.utils.concat([
    ethers.utils.hexZeroPad(commitX.toHexString(), 32),
    ethers.utils.hexZeroPad(commitY.toHexString(), 32),
  ]);

  return ethers.utils.keccak256(packedBytes);
}

function formatBalance(balance) {
  return ethers.utils.formatUnits(balance, decimals) + "USD";
}

console.log("Max price:", formatBalance(maxPrice));

function calculateWinnersIndexes(allBets, revealedX, revealedY) {
  let winners = calculateWinners(allBets, revealedX, revealedY);
  return winners.map((bet) => bet.index);
}

function calculateWinners(allBets, revealedX, revealedY) {
  allBets = allBets.map((bet, index) => {
    return {
      index: index,
      x: bet.x,
      y: bet.y,
      player: bet.player,
      prizeId: bet.prizeId,
    };
  });

  revealedX = parseInt(revealedX.toString());
  revealedY = parseInt(revealedY.toString());

  console.log("Center X:", revealedX);
  console.log("Center Y:", revealedY);

  let winners = [];
  let minDistance = Math.sqrt(IMAGE_MAX_X ** 2 + IMAGE_MAX_Y ** 2) + 1;
  minDistance = Math.round(minDistance);

  for (bet of allBets) {
    let dist = Math.sqrt((bet.x - revealedX) ** 2 + (bet.y - revealedY) ** 2);
    dist = Math.round(dist);
    console.log("Point x:", bet.x, "Point y:", bet.y, "Distance:", dist);

    if (dist < minDistance) {
      minDistance = dist;
      winners.length = 0;
      winners.push(bet);
    } else if (dist === minDistance) {
      winners.push(bet);
    }
  }

  return winners;
}

function getRandomCommitCoordinate(coord, modulo) {
  const random = ethers.BigNumber.from(
    "0x" +
      [...Array(Math.ceil(Math.random() * 35) + 5)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("")
  );

  return random.mul(modulo).add(coord);
}

const x = parseInt(gameDesignParameters.x);
const y = parseInt(gameDesignParameters.y);
const commitX = gameDesignParameters.commitX
  ? ethers.BigNumber.from(gameDesignParameters.commitX)
  : undefined;
const commitY = gameDesignParameters.commitY
  ? ethers.BigNumber.from(gameDesignParameters.commitY)
  : undefined;

function calculatePaymentForBets(betsArray) {
  return betsArray.reduce(function (total, currentValue) {
    return total.add(collections[currentValue.prizeId - 1].ticketPrice);
  }, ethers.constants.Zero);
}

module.exports = {
  expect,
  gameDesignParameters,
  calculatePaymentForBets,
  collections,
  subscriptionId,
  IMAGE_MAX_X,
  IMAGE_MAX_Y,
  MAX_TICKETS_PER_PLAYER,
  maxPrice,
  x,
  y,
  commitX,
  commitY,
  getRandomCommitCoordinate,
  calculateCommit,
  calculateWinnersIndexes,
  formatBalance,
  calculateWinners,
  decimals,
  referralThreshold,
};
