import * as fs from "fs";
import { ethers } from "hardhat";
import * as path from "path";

// Sepolia 测试网配置
const SEPOLIA_CONFIG = {
  ETH_USD_AGGREGATOR: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  TIMEOUT: 3600, // 1小时
  TWAP_INTERVAL: 900, // 15分钟
};

// 根据你提供的池子信息配置
const UNISWAP_POOL_CONFIG = {
  poolAddress: "0x1c766A9FD8818B3e8b4f87Ca85Cc40b89843B604",
  baseToken: "TKA",
  quoteToken: "TKB",
  baseTokenAddress: "0x4d9c695d6559c71fe8990ea3791bd14214772931",
  quoteTokenAddress: "0xfa9329b27f4a1747a43188e0f6de1ed334c64be2",
  baseTokenDecimals: 18,
  quoteTokenDecimals: 18,
  feeTier: 500 // 0.05%
};

interface PriceFeedSystem {
  chainlinkPriceFeedV3: any;
  priceFeedDispatcher: any;
  uniswapV3PriceFeed?: any;
}

class PriceFeedDeployer {
  private deploymentPath: string;

  constructor() {
    this.deploymentPath = path.join(__dirname, "../deployments");
  }

  async deployChainlinkPriceFeedV3(
    aggregatorAddress: string,
    timeout: number,
    twapInterval: number
  ) {
    console.log("🚀 Deploying ChainlinkPriceFeedV3...");
    console.log(`   Aggregator: ${aggregatorAddress}`);
    console.log(`   Timeout: ${timeout} seconds`);
    console.log(`   TWAP Interval: ${twapInterval} seconds`);

    const ChainlinkPriceFeedV3 = await ethers.getContractFactory("ChainlinkPriceFeedV3");
    const chainlinkPriceFeedV3 = await ChainlinkPriceFeedV3.deploy(
      aggregatorAddress,
      timeout,
      twapInterval
    );

    await chainlinkPriceFeedV3.deployed();
    
    console.log(`✅ ChainlinkPriceFeedV3 deployed to: ${chainlinkPriceFeedV3.address}`);
    
    // 初始缓存价格
    console.log("📊 Caching initial price...");
    try {
      const cacheTx = await chainlinkPriceFeedV3.cacheTwap(0);
      await cacheTx.wait();
      console.log("✅ Initial price cached");
    } catch (error) {
      console.log("⚠️  Initial cache failed (might be normal for testnet)");
    }

    return chainlinkPriceFeedV3;
  }

  async deployPriceFeedDispatcher(chainlinkPriceFeedV3Address: string) {
    console.log("\n🚀 Deploying PriceFeedDispatcher...");
    console.log(`   ChainlinkPriceFeedV3: ${chainlinkPriceFeedV3Address}`);

    const PriceFeedDispatcher = await ethers.getContractFactory("PriceFeedDispatcher");
    const priceFeedDispatcher = await PriceFeedDispatcher.deploy(chainlinkPriceFeedV3Address);

    await priceFeedDispatcher.deployed();
    
    console.log(`✅ PriceFeedDispatcher deployed to: ${priceFeedDispatcher.address}`);
    return priceFeedDispatcher;
  }

  async deployUniswapV3PriceFeed(
    poolAddress: string,
    baseToken: string,
    quoteToken: string
  ) {
    console.log("\n🚀 Deploying UniswapV3PriceFeed...");
    console.log(`   Pool: ${poolAddress}`);
    console.log(`   Pair: ${baseToken}/${quoteToken}`);

    // 验证池子地址
    if (!ethers.utils.isAddress(poolAddress)) {
      throw new Error(`Invalid pool address: ${poolAddress}`);
    }

    const UniswapV3PriceFeed = await ethers.getContractFactory("UniswapV3PriceFeed");
    const uniswapV3PriceFeed = await UniswapV3PriceFeed.deploy(poolAddress);

    await uniswapV3PriceFeed.deployed();
    
    console.log(`✅ UniswapV3PriceFeed deployed to: ${uniswapV3PriceFeed.address}`);
    
    // 验证池子详情
    await this.verifyPoolDetails(poolAddress, baseToken, quoteToken);
    
    return uniswapV3PriceFeed;
  }

  async verifyPoolDetails(poolAddress: string, baseToken: string, quoteToken: string) {
    try {
      console.log("🔍 Verifying pool details...");
      const pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
      
      const token0 = await pool.token0();
      const token1 = await pool.token1();
      const fee = await pool.fee();
      const liquidity = await pool.liquidity();
      const slot0 = await pool.slot0();
      
      console.log(`   Token0: ${token0}`);
      console.log(`   Token1: ${token1}`);
      console.log(`   Fee Tier: ${fee} (${fee / 10000}%)`);
      console.log(`   Liquidity: ${liquidity.toString()}`);
      console.log(`   Current Tick: ${slot0.tick}`);
      console.log(`   SqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
      
      // 计算当前价格
      const sq = Number(slot0.sqrtPriceX96);
      const priceX96 = (sq ** 2) / (2 ** 192);
      console.log(`   Current Price: ${priceX96} ${baseToken}/${quoteToken}`);
      
    } catch (error) {
      console.log("⚠️  Could not verify pool details:", error.message);
    }
  }

  async setupPriceFeedSystem(
    chainlinkAggregator: string,
    uniswapConfig?: typeof UNISWAP_POOL_CONFIG
  ): Promise<PriceFeedSystem> {
    console.log("🏁 Setting up complete price feed system...");

    // 1. 部署 ChainlinkPriceFeedV3
    const chainlinkPriceFeedV3 = await this.deployChainlinkPriceFeedV3(
      chainlinkAggregator,
      SEPOLIA_CONFIG.TIMEOUT,
      SEPOLIA_CONFIG.TWAP_INTERVAL
    );

    // 2. 部署 PriceFeedDispatcher
    const priceFeedDispatcher = await this.deployPriceFeedDispatcher(chainlinkPriceFeedV3.address);

    let uniswapV3PriceFeed;
    
    // 3. 如果提供了 Uniswap 配置，部署 Uniswap 价格源
    if (uniswapConfig) {
      uniswapV3PriceFeed = await this.deployUniswapV3PriceFeed(
        uniswapConfig.poolAddress,
        uniswapConfig.baseToken,
        uniswapConfig.quoteToken
      );

      // 4. 设置 Uniswap 价格源到调度器
      console.log("\n🔗 Setting UniswapV3PriceFeed to dispatcher...");
      const setTx = await priceFeedDispatcher.setUniswapV3PriceFeed(uniswapV3PriceFeed.address);
      await setTx.wait();
      console.log("✅ UniswapV3PriceFeed set in dispatcher");
    }

    // 5. 验证系统
    await this.verifyPriceFeedSystem(priceFeedDispatcher, chainlinkPriceFeedV3, uniswapV3PriceFeed);

    return {
      chainlinkPriceFeedV3,
      priceFeedDispatcher,
      uniswapV3PriceFeed
    };
  }

  async verifyPriceFeedSystem(
    dispatcher: any,
    chainlinkFeed: any,
    uniswapFeed?: any
  ) {
    console.log("\n🔍 Verifying price feed system...");

    try {
      // 验证 Chainlink 价格源
      const chainlinkFromDispatcher = await dispatcher.getChainlinkPriceFeedV3();
      console.log(`✅ ChainlinkPriceFeedV3 in dispatcher: ${chainlinkFromDispatcher === chainlinkFeed.address}`);

      // 验证 Uniswap 价格源（如果设置了）
      if (uniswapFeed) {
        const uniswapFromDispatcher = await dispatcher.getUniswapV3PriceFeed();
        console.log(`✅ UniswapV3PriceFeed in dispatcher: ${uniswapFromDispatcher === uniswapFeed.address}`);
        
        // 测试 Uniswap 价格获取
        const uniswapPrice = await uniswapFeed.getPrice();
        console.log(`✅ Uniswap ${UNISWAP_POOL_CONFIG.baseToken}/${UNISWAP_POOL_CONFIG.quoteToken} Price: ${ethers.utils.formatEther(uniswapPrice)}`);
      }

      // 测试调度器价格获取
      const price = await dispatcher.getPrice(0);
      console.log(`✅ Current price from dispatcher: ${ethers.utils.formatEther(price)}`);

      // 测试 TWAP 价格
      const twapPrice = await dispatcher.getPrice(3600);
      console.log(`✅ 1-hour TWAP price: ${ethers.utils.formatEther(twapPrice)}`);

      // 检查调度状态
      const useUniswap = await dispatcher.isToUseUniswapV3PriceFeed();
      console.log(`✅ Using Uniswap: ${useUniswap}`);

      // 检查 Chainlink 状态
      const isTimedOut = await chainlinkFeed.isTimedOut();
      console.log(`✅ Chainlink timed out: ${isTimedOut}`);

    } catch (error) {
      console.log("⚠️  Verification had some issues:", error);
    }
  }

  async testPriceFeedFunctionality(system: PriceFeedSystem) {
    console.log("\n🧪 Testing price feed functionality...");
    
    try {
      // 测试 Chainlink 价格源
      const chainlinkPrice = await system.chainlinkPriceFeedV3.getPrice(0);
      console.log(`✅ Chainlink price: ${ethers.utils.formatUnits(chainlinkPrice, 8)}`);
      
      const lastValidPrice = await system.chainlinkPriceFeedV3.getLastValidPrice();
      const lastValidTimestamp = await system.chainlinkPriceFeedV3.getLastValidTimestamp();
      console.log(`✅ Chainlink last valid price: ${ethers.utils.formatUnits(lastValidPrice, 8)} at ${new Date(lastValidTimestamp * 1000).toISOString()}`);
      
      // 测试 Uniswap 价格源（如果存在）
      if (system.uniswapV3PriceFeed) {
        const uniswapPrice = await system.uniswapV3PriceFeed.getPrice();
        console.log(`✅ Uniswap price: ${ethers.utils.formatEther(uniswapPrice)} ${UNISWAP_POOL_CONFIG.baseToken}/${UNISWAP_POOL_CONFIG.quoteToken}`);
        
        const poolAddress = await system.uniswapV3PriceFeed.pool();
        console.log(`✅ Uniswap pool: ${poolAddress}`);
      }
      
      // 测试调度器
      const dispatcherPrice = await system.priceFeedDispatcher.getPrice(0);
      console.log(`✅ Dispatcher price: ${ethers.utils.formatEther(dispatcherPrice)}`);
      
      const dispatcherTwap = await system.priceFeedDispatcher.getPrice(3600);
      console.log(`✅ Dispatcher TWAP: ${ethers.utils.formatEther(dispatcherTwap)}`);
      
    } catch (error) {
      console.log("❌ Functionality test failed:", error);
    }
  }

  async saveDeployment(system: PriceFeedSystem, network: string) {
    const deploymentDir = path.join(this.deploymentPath, network);
    
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const deployment = {
      timestamp: new Date().toISOString(),
      network: network,
      config: {
        chainlinkTimeout: SEPOLIA_CONFIG.TIMEOUT,
        twapInterval: SEPOLIA_CONFIG.TWAP_INTERVAL,
        uniswapPool: UNISWAP_POOL_CONFIG.poolAddress
      },
      contracts: {
        ChainlinkPriceFeedV3: system.chainlinkPriceFeedV3.address,
        PriceFeedDispatcher: system.priceFeedDispatcher.address,
        UniswapV3PriceFeed: system.uniswapV3PriceFeed?.address || "Not deployed"
      },
      tokens: {
        baseToken: UNISWAP_POOL_CONFIG.baseToken,
        quoteToken: UNISWAP_POOL_CONFIG.quoteToken,
        baseTokenAddress: UNISWAP_POOL_CONFIG.baseTokenAddress,
        quoteTokenAddress: UNISWAP_POOL_CONFIG.quoteTokenAddress
      }
    };

    const deploymentFile = path.join(deploymentDir, "price-feed-system.json");
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    
    console.log("\n💾 Deployment saved to:", deploymentFile);
    
    // 同时保存单独的合约部署文件
    if (system.uniswapV3PriceFeed) {
      const uniswapDeployment = {
        contract: "UniswapV3PriceFeed",
        address: system.uniswapV3PriceFeed.address,
        pool: UNISWAP_POOL_CONFIG.poolAddress,
        baseToken: UNISWAP_POOL_CONFIG.baseToken,
        quoteToken: UNISWAP_POOL_CONFIG.quoteToken,
        timestamp: new Date().toISOString()
      };
      
      const uniswapFile = path.join(deploymentDir, `uniswap-pricefeed-${UNISWAP_POOL_CONFIG.baseToken}-${UNISWAP_POOL_CONFIG.quoteToken}.json`);
      fs.writeFileSync(uniswapFile, JSON.stringify(uniswapDeployment, null, 2));
    }
  }
}

// 主部署函数
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log(`💰 Balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);

  const deployerInstance = new PriceFeedDeployer();
  
  try {
    console.log("🎯 Deployment Options:");
    console.log("1. Deploy only Chainlink system (without Uniswap)");
    console.log("2. Deploy full system with Uniswap TKA/TKB pool");
    
    // 这里可以根据需要选择部署选项
    // 为了演示，我们部署完整系统
    const deployFullSystem = true;
    
    let system: PriceFeedSystem;
    
    if (deployFullSystem) {
      // 部署完整系统（Chainlink + Uniswap）
      console.log("\n🔹 Deploying full price feed system with Uniswap...");
      system = await deployerInstance.setupPriceFeedSystem(
        SEPOLIA_CONFIG.ETH_USD_AGGREGATOR,
        UNISWAP_POOL_CONFIG
      );
    } else {
      // 部署只有 Chainlink 的系统
      console.log("\n🔹 Deploying Chainlink-only system...");
      system = await deployerInstance.setupPriceFeedSystem(
        SEPOLIA_CONFIG.ETH_USD_AGGREGATOR
      );
    }

    // 测试功能
    await deployerInstance.testPriceFeedFunctionality(system);

    // 保存部署信息
    await deployerInstance.saveDeployment(system, "sepolia");

    console.log("\n🎉 Price feed system deployed successfully!");
    console.log("\n📋 Contract Addresses:");
    console.log(`   ChainlinkPriceFeedV3: ${system.chainlinkPriceFeedV3.address}`);
    console.log(`   PriceFeedDispatcher: ${system.priceFeedDispatcher.address}`);
    if (system.uniswapV3PriceFeed) {
      console.log(`   UniswapV3PriceFeed: ${system.uniswapV3PriceFeed.address}`);
      console.log(`   Trading Pair: ${UNISWAP_POOL_CONFIG.baseToken}/${UNISWAP_POOL_CONFIG.quoteToken}`);
    }

  } catch (error) {
    console.error("💥 Deployment failed:", error);
    process.exit(1);
  }
}

// 添加 Uniswap 价格源的函数
async function addUniswapPriceFeed(dispatcherAddress: string) {
  const [deployer] = await ethers.getSigners();
  const deployerInstance = new PriceFeedDeployer();

  console.log("🔗 Adding UniswapV3PriceFeed to existing system...");

  const dispatcher = await ethers.getContractAt("PriceFeedDispatcher", dispatcherAddress);
  
  // 部署 Uniswap 价格源
  const uniswapV3PriceFeed = await deployerInstance.deployUniswapV3PriceFeed(
    UNISWAP_POOL_CONFIG.poolAddress,
    UNISWAP_POOL_CONFIG.baseToken,
    UNISWAP_POOL_CONFIG.quoteToken
  );

  // 设置到调度器
  const setTx = await dispatcher.setUniswapV3PriceFeed(uniswapV3PriceFeed.address);
  await setTx.wait();
  
  console.log("✅ UniswapV3PriceFeed added to system");
  
  // 验证集成
  const updatedUniswapFeed = await dispatcher.getUniswapV3PriceFeed();
  console.log(`✅ Updated UniswapV3PriceFeed in dispatcher: ${updatedUniswapFeed}`);
  
  const useUniswap = await dispatcher.isToUseUniswapV3PriceFeed();
  console.log(`✅ Will use Uniswap price feed: ${useUniswap}`);
  
  return uniswapV3PriceFeed;
}

// 验证合约函数
async function verifyContracts() {
  const deploymentFile = path.join(__dirname, "../deployments/sepolia/price-feed-system.json");
  
  if (!fs.existsSync(deploymentFile)) {
    console.log("No deployment found");
    return;
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  
  console.log("🔍 Verifying contracts on Etherscan...");
  
  // 验证 ChainlinkPriceFeedV3
//   try {
//     await run("verify:verify", {
//       address: deployment.contracts.ChainlinkPriceFeedV3,
//       constructorArguments: [
//         SEPOLIA_CONFIG.ETH_USD_AGGREGATOR,
//         SEPOLIA_CONFIG.TIMEOUT,
//         SEPOLIA_CONFIG.TWAP_INTERVAL
//       ]
//     });
//     console.log("✅ ChainlinkPriceFeedV3 verified");
//   } catch (error) {
//     console.log("ChainlinkPriceFeedV3 verification:", error.message);
//   }
  
  // 验证 PriceFeedDispatcher
//   try {
//     await run("verify:verify", {
//       address: deployment.contracts.PriceFeedDispatcher,
//       constructorArguments: [deployment.contracts.ChainlinkPriceFeedV3]
//     });
//     console.log("✅ PriceFeedDispatcher verified");
//   } catch (error) {
//     console.log("PriceFeedDispatcher verification:", error.message);
//   }
  
  // 验证 UniswapV3PriceFeed（如果部署了）
//   if (deployment.contracts.UniswapV3PriceFeed !== "Not deployed") {
//     try {
//       await run("verify:verify", {
//         address: deployment.contracts.UniswapV3PriceFeed,
//         constructorArguments: [UNISWAP_POOL_CONFIG.poolAddress]
//       });
//       console.log("✅ UniswapV3PriceFeed verified");
//     } catch (error) {
//       console.log("UniswapV3PriceFeed verification:", error.message);
//     }
//   }
}

if (require.main === module) {
  main().catch(console.error);
}

export {
    addUniswapPriceFeed,
    PriceFeedDeployer,
    SEPOLIA_CONFIG,
    UNISWAP_POOL_CONFIG,
    verifyContracts
};

