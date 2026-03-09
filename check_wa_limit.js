import fs from 'fs';
import https from 'https';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
});

const token = env.CLOUD_API_ACCESS_TOKEN;
const wabaId = env.WA_BUSINESS_ACCOUNT_ID;
const version = env.CLOUD_API_VERSION || 'v19.0';

if (!token || !wabaId) {
  console.log("Missing WhatsApp API credentials in environment variables.");
  process.exit(1);
}

const options = {
  hostname: 'graph.facebook.com',
  path: `/${version}/${wabaId}/phone_numbers?access_token=${token}&fields=display_phone_number,messaging_limit_tier,quality_rating`,
  method: 'GET'
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
