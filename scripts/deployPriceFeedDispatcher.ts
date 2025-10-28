// scripts/deployPriceFeedDispatcher.ts
import { ethers } from "hardhat";

async function deployPriceFeedDispatcher() {
  console.log("=== 部署 PriceFeedDispatcher ===");

  const [deployer] = await ethers.getSigners();
  
  // 已知的 ChainlinkPriceFeedV3 地址
  const chainlinkPriceFeedV3Address = "0x4aB0123054Cc53909818d4bBC356c14A29fcd65B";
  
  console.log("使用 ChainlinkPriceFeedV3 地址:", chainlinkPriceFeedV3Address);
  console.log("部署者:", deployer.address);

  // 1. 部署 PriceFeedDispatcher
  const PriceFeedDispatcher = await ethers.getContractFactory("PriceFeedDispatcher");
  const priceFeedDispatcher = await PriceFeedDispatcher.deploy(chainlinkPriceFeedV3Address);
  await priceFeedDispatcher.deployed();
  
  console.log("✅ PriceFeedDispatcher 部署地址:", priceFeedDispatcher.address);

  // 2. 验证部署
  console.log("\n2. 验证部署...");
  
  const chainlinkFeed = await priceFeedDispatcher.getChainlinkPriceFeedV3();
  console.log("ChainlinkPriceFeedV3 地址:", chainlinkFeed);
  
  const uniswapFeed = await priceFeedDispatcher.getUniswapV3PriceFeed();
  console.log("UniswapV3PriceFeed 地址:", uniswapFeed); // 应该是零地址，尚未设置
  
  const decimals = await priceFeedDispatcher.decimals();
  console.log("价格精度:", decimals);
  
  // 3. 测试获取价格
  try {
    const price = await priceFeedDispatcher.getDispatchedPrice(0);
    console.log("当前价格:", price.toString());
  } catch (error) {
    console.log("获取价格失败 (可能 Chainlink 未配置):", error.message);
  }

  return priceFeedDispatcher;
}

deployPriceFeedDispatcher().catch(console.error);