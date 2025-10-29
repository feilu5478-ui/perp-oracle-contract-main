import { ethers } from "hardhat";

async function deployPriceFeedDispatcher() {
  console.log("=== 部署 PriceFeedDispatcher ===");

  const [deployer] = await ethers.getSigners();
  
  const aggregatorAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
  const aggregator = await ethers.getContractAt("AggregatorV3Interface", aggregatorAddress);
  console.log("部署者:", deployer.address);

  const roundData = await aggregator.latestRoundData();
  const ethPriceInUSD = roundData.answer; // 8 decimals
  
  // 转换为 18 decimals
  const ethPrice = ethers.BigNumber.from(ethPriceInUSD).mul(ethers.BigNumber.from(10).pow(10));
  
  console.log("ETH Price from Chainlink:", ethers.utils.formatUnits(ethPrice, 18));
    return ethPrice;
}

deployPriceFeedDispatcher().catch(console.error);