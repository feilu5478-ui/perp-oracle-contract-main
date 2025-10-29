import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("开始设置 UniswapV3PriceFeed...");
  console.log("操作账户:", deployer.address);
  console.log("账户余额:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // 合约地址配置
  const PRICE_FEED_DISPATCHER_ADDRESS = "0x2aFd8B0B9CA476fA85A35bF7AB138d15fda35164"; // 替换为你的 PriceFeedDispatcher 地址
  const UNISWAP_V3_PRICE_FEED_ADDRESS = "0x0AAd94106E1d0fA6df3ce4Db49cF901dbcCeEE8E";

  console.log("PriceFeedDispatcher 地址:", PRICE_FEED_DISPATCHER_ADDRESS);
  console.log("UniswapV3PriceFeed 地址:", UNISWAP_V3_PRICE_FEED_ADDRESS);

  try {

    // 2. 获取合约实例
    console.log("连接合约...");
    
    const PriceFeedDispatcher = await ethers.getContractFactory("PriceFeedDispatcher");
    const priceFeedDispatcher = PriceFeedDispatcher.attach(PRICE_FEED_DISPATCHER_ADDRESS).connect(deployer);

    // 3. 检查当前设置
    console.log("检查当前设置...");
    
    try {
      const currentUniswapPriceFeed = await priceFeedDispatcher.getUniswapV3PriceFeed();
      console.log("当前 UniswapV3PriceFeed 地址:", currentUniswapPriceFeed);
      
      if (currentUniswapPriceFeed !== ethers.constants.AddressZero) {
        console.log("⚠  UniswapV3PriceFeed 已设置，将被覆盖");
      }
    } catch (error) {
      console.log("无法获取当前 UniswapV3PriceFeed 设置，继续执行...");
    }

    // 4. 检查权限
    console.log("检查操作权限...");
    
    try {
      const owner = await priceFeedDispatcher.owner();
      console.log("合约所有者:", owner);
      
      if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log("⚠  当前账户不是合约所有者，可能无法执行设置");
      } else {
        console.log("✓  当前账户是合约所有者");
      }
    } catch (error) {
      console.log("无法检查合约所有者，继续执行...");
    }

    // 5. 执行设置
    console.log("执行 setUniswapV3PriceFeed...");
    
    // const tx = await priceFeedDispatcher.setUniswapV3PriceFeed(
    //   UNISWAP_V3_PRICE_FEED_ADDRESS,
    //   { 
    //     gasLimit: 100000,
    //     gasPrice: ethers.utils.parseUnits("10", "gwei")
    //   }
    // );
    
    // console.log("交易哈希:", tx.hash);
    // console.log("等待交易确认...");
    
    // const receipt = await tx.wait();
    // console.log("✓ 交易确认，区块:", receipt.blockNumber);

    // 6. 验证设置
    // console.log("验证设置...");
    
    // const newUniswapPriceFeed = await priceFeedDispatcher.getUniswapV3PriceFeed();
    // const isSetCorrectly = newUniswapPriceFeed.toLowerCase() === UNISWAP_V3_PRICE_FEED_ADDRESS.toLowerCase();
    
    // if (isSetCorrectly) {
    //   console.log("✅ UniswapV3PriceFeed 设置成功!");
    // } else {
    //   console.log("❌ UniswapV3PriceFeed 设置验证失败");
    //   console.log("期望地址:", UNISWAP_V3_PRICE_FEED_ADDRESS);
    //   console.log("实际地址:", newUniswapPriceFeed);
    // }

    // 7. 测试价格获取
    console.log("测试价格获取...");
    
    try {
      // 切换到 Uniswap 价格
      const dispatchTx = await priceFeedDispatcher.dispatchPrice(0);
      await dispatchTx.wait();
      console.log("✓ 已切换到 Uniswap 价格");
      
      const isUsingUniswap = await priceFeedDispatcher.isToUseUniswapV3PriceFeed();
      console.log("当前使用 Uniswap 价格:", isUsingUniswap);
      
      const currentPrice = await priceFeedDispatcher.getPrice(0);
      console.log("当前价格:", ethers.utils.formatUnits(currentPrice, 18));
    } catch (error) {
      console.log("⚠ 价格获取测试失败:", error.message);
    }

    // 8. 保存操作记录
    const operationInfo = {
      network: (await ethers.provider.getNetwork()).name,
      operator: deployer.address,
      timestamp: new Date().toISOString(),
    //   transactionHash: tx.hash,
      contracts: {
        priceFeedDispatcher: PRICE_FEED_DISPATCHER_ADDRESS,
        uniswapV3PriceFeed: UNISWAP_V3_PRICE_FEED_ADDRESS
      }
    };

    const fs = require("fs");
    const path = require("path");
    
    const operationsDir = path.join(__dirname, "../operations");
    if (!fs.existsSync(operationsDir)) {
      fs.mkdirSync(operationsDir, { recursive: true });
    }
    
    const operationFile = path.join(operationsDir, `set-uniswap-pricefeed-${Date.now()}.json`);
    fs.writeFileSync(operationFile, JSON.stringify(operationInfo, null, 2));
    
    console.log("📁 操作记录已保存到:", operationFile);

    console.log("\n🎉 设置完成!");

  } catch (error) {
    console.error("❌ 设置失败:", error);
    
    // 提供详细的错误信息
    if (error.message.includes("PFD_UCAU")) {
      console.error("错误原因: UniswapV3PriceFeed 必须是合约且未初始化");
    } else if (error.message.includes("only owner")) {
      console.error("错误原因: 只有合约所有者可以执行此操作");
    } else if (error.message.includes("insufficient funds")) {
      console.error("错误原因: 账户余额不足");
    } else if (error.message.includes("nonce")) {
      console.error("错误原因: 交易 nonce 问题，请稍后重试");
    }
    
    throw error;
  }
}

// 运行设置
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("设置脚本执行失败:", error);
    process.exit(1);
  });