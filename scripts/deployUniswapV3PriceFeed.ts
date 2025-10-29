import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("开始部署 UniswapV3PriceFeed 合约...");
  console.log("部署者地址:", deployer.address);
  console.log("部署者余额:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // 池子地址
  const poolAddress = "0xf6f23547538bf705360fcee6b89aff1baed3599b";

  try {
    // 2. 部署 UniswapV3PriceFeed 合约
    console.log("正在部署 UniswapV3PriceFeed...");
    const UniswapV3PriceFeedFactory = await ethers.getContractFactory("UniswapV3PriceFeed");
    const uniswapV3PriceFeed = await UniswapV3PriceFeedFactory.deploy(poolAddress);
    
    console.log("交易已发送，等待确认...");
    await uniswapV3PriceFeed.deployed();
    
    console.log("✅ UniswapV3PriceFeed 部署成功!");
    console.log("合约地址:", uniswapV3PriceFeed.address);

    // 3. 验证部署
    console.log("验证合约部署...");
    const deployedPool = await uniswapV3PriceFeed.pool();
    console.log("✓ 池子地址验证:", deployedPool === poolAddress);

    // 4. 测试价格获取
    console.log("测试价格获取...");
    try {
      const price = await uniswapV3PriceFeed.getPrice();
      const decimals = await uniswapV3PriceFeed.decimals();
      
      console.log("✓ 价格获取成功");
      console.log("当前价格:", ethers.utils.formatUnits(price, decimals));
      console.log("价格小数位数:", decimals);
    } catch (error) {
      console.log("⚠ 价格获取测试失败，但合约部署成功:", error.message);
    }

    // 5. 保存部署信息
    const deploymentInfo = {
      network: (await ethers.provider.getNetwork()).name,
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contract: {
        name: "UniswapV3PriceFeed",
        address: uniswapV3PriceFeed.address,
        pool: poolAddress,
        transactionHash: uniswapV3PriceFeed.deployTransaction.hash
      }
    };

    // 保存到文件
    const fs = require("fs");
    const path = require("path");
    
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentsDir, `UniswapV3PriceFeed-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log("📁 部署信息已保存到:", deploymentFile);

    // 6. 输出使用示例
    console.log("\n🎉 部署完成!");
    console.log("\n使用示例:");
    console.log(`
// 连接到已部署的合约
const UniswapV3PriceFeed = await ethers.getContractAt("UniswapV3PriceFeed", "${uniswapV3PriceFeed.address}");

// 获取价格
const price = await UniswapV3PriceFeed.getPrice();
console.log("价格:", ethers.utils.formatUnits(price, 18));

// 获取小数位数
const decimals = await UniswapV3PriceFeed.decimals();

// 获取池子地址
const pool = await UniswapV3PriceFeed.pool();
    `);

  } catch (error) {
    console.error("❌ 部署失败:", error);
    
    // 提供详细的错误信息
    if (error.message.includes("UPF_PANC")) {
      console.error("错误原因: 池子地址不是有效的合约");
    } else if (error.message.includes("insufficient funds")) {
      console.error("错误原因: 部署者余额不足");
    } else if (error.message.includes("nonce")) {
      console.error("错误原因: 交易 nonce 问题，请稍后重试");
    }
    
    throw error;
  }
}

// 运行部署
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("部署脚本执行失败:", error);
    process.exit(1);
  });