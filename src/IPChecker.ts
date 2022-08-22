import axios from 'axios';
import config from 'config';
import { URL } from 'url';
import data from './Data';
import IPCheck from './models/IPCheck';

const MAX_LOAD = 12;
const EMAIL: string = config.get('ipCheck.email');
const CHECK_URL: string = config.get('ipCheck.url');

let load = 0;
let backlog: string[] = [];

async function shiftBacklog() {
  --load;
  if (backlog.length === 0 || load > MAX_LOAD) {
    return;
  }
  const ip = backlog.shift();
  await data().fetchUserByIP(ip).validate();
}

export default async function checkIp(ip: string) {
  let model = await IPCheck.findOne({ where: { ip } });
  if (model && !model.expired) {
    return model;
  }

  if (!model) {
    model = await IPCheck.create({ ip });
  } else {
    model.setDataValue('validated', undefined);
    await model.save();
  }

  if (load > MAX_LOAD) {
    backlog.push(ip);
    return model;
  }

  const url = new URL(CHECK_URL);
  url.search = (new URLSearchParams({
    ip: ip,
    contact: EMAIL,
    flags: 'm',
    format: 'json',
  })).toString();
  try {
    ++load;
    const response = await axios(url.toString());
    setTimeout(shiftBacklog, 60000);
    let validated: boolean = false;
    if (response.data.status === 'success') {
      validated = parseInt(response.data.result) !== 1;
    } else if (response.data.status === 'error' && response.data.result === '-3') {
      validated = true;
    } else {
      throw new Error(JSON.stringify(response.data));
    }
    if (!model) {
      model = await IPCheck.create({ ip, validated });
    } else {
      await model.setAttributes({ validated }).save();
    }
    return model;
  } catch (e) {
    if (e.response && e.response.status === 429) {
      console.log('Too Many Requests');
    } else {
      console.log('Error validating ' + ip, e);
    }
  }
  return undefined;
}
