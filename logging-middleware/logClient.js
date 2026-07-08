const axios = require('axios');

const ALLOWED_STACKS = ['backend','frontend'];
const ALLOWED_LEVELS = ['debug','info','warn','error','fatal'];
const ALLOWED_PACKAGES = ['cache','controller','cron_job','db','domain','handler','repository','route','service','api','component','hook','page','state','style','auth','config','middleware','utils'];
async function logEvent(stack, level, packageName, message) {
  if (!ALLOWED_STACKS.includes(stack)) throw new Error(`Invalid stack: ${stack}`);
  if (!ALLOWED_LEVELS.includes(level)) throw new Error(`Invalid level: ${level}`);
  if (!ALLOWED_PACKAGES.includes(packageName)) throw new Error(`Invalid package: ${packageName}`);
  if (typeof message !== 'string' || !message) throw new Error('message is required');
  const token = process.env.LOGGING_SERVICE_TOKEN;
  if (!token) throw new Error('LOGGING_SERVICE_TOKEN environment variable not set');
  const url = 'http://4.224.186.213/evaluation-service/logs';
  try {
    const res = await axios.post(url, { stack, level, package: packageName, message }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    const data = res.data;
    if (data && (data.logID || data.logId || data.success)) {
      return data;
    }
    return data;
  } catch (err) {
    if (err.response) {
      const { status, data } = err.response;
      const e = new Error(`Logging failed with status ${status}`);
      e.status = status;
      e.body = data;
      throw e;
    }
    throw err;
  }
}

module.exports = { logEvent, ALLOWED_STACKS, ALLOWED_LEVELS, ALLOWED_PACKAGES };
