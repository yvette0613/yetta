const tencentcloud = require("tencentcloud-sdk-nodejs");

const LkeClient = tencentcloud.lke.v20231130.Client;

module.exports = async (req, res) => {
  // 1. 设置跨域头 (允许网页访问)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { fileType, isPublic } = req.body;

    // 2. 初始化腾讯云客户端
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

    // 3. 构造请求参数
    const params = {
      BotBizId: process.env.TENCENT_BOT_BIZ_ID,
      FileType: fileType || 'jpg',
      IsPublic: isPublic === true, 
      TypeKey: 'realtime'
    };

    // 4. 调用接口
    const data = await client.DescribeStorageCredential(params);

    // ============================================
    // 🔥 核心修复部分：数据格式化
    // ============================================
    // 腾讯云返回的数据结构是嵌套的：data.Response.Credentials.TmpSecretId
    // 前端需要的是扁平的：TmpSecretId
    
    const response = data.Response || {};
    const credentials = response.Credentials || {};

    // 我们把需要的所有字段都提到最外层
    const flatData = {
      // 密钥信息 (从 Credentials 里拿)
      TmpSecretId: credentials.TmpSecretId,
      TmpSecretKey: credentials.TmpSecretKey,
      Token: credentials.Token,
      
      // 文件信息 (从 Response 里拿)
      Bucket: response.Bucket,
      Region: response.Region,
      UploadPath: response.UploadPath,
      
      // 时间信息 (通常在 Response 里，也可能在 Credentials 里，做个兼容)
      StartTime: credentials.StartTime || response.StartTime,
      ExpiredTime: credentials.ExpiredTime || response.ExpiredTime,
      
      // 请求ID，方便排查
      RequestId: data.RequestId
    };

    // 5. 返回处理好的扁平数据
    res.status(200).json(flatData);

  } catch (error) {
    console.error("Credential Error:", error);
    res.status(500).json({ error: error.message });
  }
};
