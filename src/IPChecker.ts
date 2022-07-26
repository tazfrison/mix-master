import axios from 'axios';
import config from 'config';
import { URL } from 'url';
import data from './Data';
import IPCheck from './models/IPCheck';

const EXPIRATION = 6 * 60 * 60 * 1000; //6 Hours
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

async function getIP(ip: string) {
  const model = await IPCheck.findOne({ where: { ip } });
  if (!model) {
    return undefined;
  }
  const expiration = (new Date(model.updatedAt)).getTime() + EXPIRATION;
  if (expiration < (new Date()).getTime()) {
    model.destroy();
    return undefined;
  }
  return model;
}

export default async function checkIp(ip: string): Promise<boolean | undefined> {
  const model = await getIP(ip);
  if (model) {
    return model.validated;
  }

  if (load > MAX_LOAD) {
    backlog.push(ip);
    return undefined;
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
    if (response.data.status === 'success') {
      const model = await IPCheck.create({ ip, validated: parseInt(response.data.result) !== 1});
      return model.validated;
    }
    throw new Error(JSON.stringify(response.data));
  } catch (e) {
    if (e.response.status === 429) {
      console.log('Too Many Requests');
    } else {
      console.log('Error validating ' + ip, e);
    }
  }
  return undefined;
}
