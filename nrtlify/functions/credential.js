const tencentcloud = require("tencentcloud-sdk-nodejs");

exports.handler = async function (event, context) {
  // 1. 设置 CORS 头，允许前端跨域调用
  const headers = {
    'Access-Control-Allow-Origin': '*', // 上线后建议改为你的域名
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // 处理预检请求 (OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 2. 从 Netlify 环境变量获取密钥
  const SECRET_ID = process.env.TENCENT_SECRET_ID;
  const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
  const BOT_APP_ID = process.env.TENCENT_BOT_APP_ID; // 即 BotBizId

  if (!SECRET_ID || !SECRET_KEY || !BOT_APP_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '环境变量未配置 (SECRET_ID/KEY/APP_ID)' })
    };
  }

  // 3. 初始化腾讯云客户端
  const LkeClient = tencentcloud.lke.v20231130.Client;
  const clientConfig = {
    credential: {
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
    },
    region: "ap-guangzhou",
    profile: {
      httpProfile: {
        endpoint: "lke.tencentcloudapi.com",
      },
    },
  };

  const client = new LkeClient(clientConfig);

  try {
    // 4. 解析前端传来的参数 (注意：Netlify 的 event.body 是字符串)
    const { fileType, isPublic } = JSON.parse(event.body || '{}');

    const params = {
      "BotBizId": BOT_APP_ID,
      "FileType": fileType || "png",
      "IsPublic": isPublic || false,
      "TypeKey": isPublic ? "realtime" : "offline"
    };

    console.log("正在请求腾讯云凭证...", params.TypeKey);

    // 5. 调用腾讯云接口
    const data = await client.DescribeStorageCredential(params);

    // 6. 返回结果给前端
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data.Response)
    };

  } catch (err) {
    console.error("Credential Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
