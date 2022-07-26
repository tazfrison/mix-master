import * as fs from 'fs';
import config from 'config';
import { registerHandler } from 'segfault-handler';
import Mumble from './Mumble';
import TF2 from './TF2';
import WebServer from './WebServer';
import data from './Data';

registerHandler('crash.log');

data().initModels().then(() => {
  const mumble = new Mumble(config.get('mumble.ip'), {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  });
  mumble.connect();
  
  const webserver = new WebServer();
  webserver.start();
  
  const servers: { name: string, ip: string, rcon: string, port?: number }[] = config.get('tf2.servers');
  servers.forEach(({ name, ip, rcon, port }) => new TF2(name, rcon, ip, port));
});
