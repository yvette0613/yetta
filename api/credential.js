const tencentcloud = require("tencentcloud-sdk-nodejs");

const LkeClient = tencentcloud.lke.v20231130.Client;

module.exports = async (req, res) => {
  // 1. 设置跨域头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { fileType, isPublic } = req.body;

    const client = new LkeClient({
      credential: {
        secretId: process.env.TENCENT_SECRET_ID,
        secretKey: process.env.TENCENT_SECRET_KEY,
      },
      region: "ap-guangzhou", 
      profile: {
        httpProfile: {
          endpoint: "lke.tencentcloudapi.com",
        },
      },
    });

    const params = {
      BotBizId: process.env.TENCENT_BOT_BIZ_ID,
      FileType: fileType || 'jpg',
      IsPublic: isPublic === true, 
      TypeKey: 'realtime'
    };

    const data = await client.DescribeStorageCredential(params);

    // ============================================
    // 🔥 核心修复：兼容两种数据结构
    // ============================================
    // SDK 返回的 data 可能直接就是数据，也可能包裹在 Response 里
    // 我们用 || 运算符同时兼容这两种情况
    const payload = data.Response || data;
    const credentials = payload.Credentials || {};

    const flatData = {
      // 密钥信息
      TmpSecretId: credentials.TmpSecretId,
      TmpSecretKey: credentials.TmpSecretKey,
      Token: credentials.Token,
      
      // 存储桶信息 (这就是之前报错缺少的 Bucket)
      Bucket: payload.Bucket,
      Region: payload.Region,
      UploadPath: payload.UploadPath,
      
      // 辅助信息
      StartTime: credentials.StartTime || payload.StartTime,
      ExpiredTime: credentials.ExpiredTime || payload.ExpiredTime,
      RequestId: data.RequestId || payload.RequestId
    };

    // 调试日志（如果你会看Vercel后台日志的话可以看到这个）
    console.log("Credential Success, Bucket:", flatData.Bucket);

    res.status(200).json(flatData);

  } catch (error) {
    console.error("Credential Error:", error);
    // 把详细错误返回给前端，方便弹窗看到
    res.status(500).json({ error: error.message });
  }
};
