import * as fs from 'fs';
import config from 'config';
import { registerHandler } from 'segfault-handler';
import Mumble from './Mumble';
import TF2Server from './TF2Server';
import WebServer from './WebServer';
import data from './Data';
import { Config } from './types';

registerHandler('crash.log');

data().initModels().then(() => {
  const mumble = new Mumble(config.get('mumble.ip'), {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  });
  mumble.connect();
  
  const webserver = new WebServer();
  webserver.start();
  
  const servers = config.get<Config.TF2Server[]>('tf2.servers');
  servers.forEach(server => new TF2Server(server));
});
