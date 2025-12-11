// api/credential.js
const tencentcloud = require("tencentcloud-sdk-nodejs");

const LkeClient = tencentcloud.lke.v20231130.Client;

module.exports = async (req, res) => {
  // 处理跨域 (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { fileType, isPublic } = req.body;

    // 1. 初始化腾讯云客户端
    const client = new LkeClient({
      credential: {
        secretId: process.env.TENCENT_SECRET_ID,   // 环境变量
        secretKey: process.env.TENCENT_SECRET_KEY, // 环境变量
      },
      region: "ap-guangzhou", // 默认为广州，根据你的应用实际情况调整
      profile: {
        httpProfile: {
          endpoint: "lke.tencentcloudapi.com",
        },
      },
    });

    // 2. 构造请求参数
    // 注意：TypeKey 必须设为 'realtime' 才能用于对话框上传
    const params = {
      BotBizId: process.env.TENCENT_BOT_BIZ_ID, // 环境变量
      FileType: fileType || 'jpg',
      IsPublic: isPublic === true, // 图片必须为 true
      TypeKey: 'realtime'
    };

    // 3. 调用接口获取凭证
    const data = await client.DescribeStorageCredential(params);

    // 4. 返回结果给前端
    res.status(200).json(data);

  } catch (error) {
    console.error("Credential Error:", error);
    res.status(500).json({ error: error.message });
  }
};
