import config from 'config';
import * as fs from 'fs';
import { registerHandler } from 'segfault-handler';
import data from './Data';
import Server from './models/Server';
import Mumble from './Mumble';
import WebServer from './WebServer';

registerHandler('crash.log');

data().initModels().then(async () => {
  const mumble = new Mumble(config.get('mumble.ip'), {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  });
  mumble.connect();

  const webserver = new WebServer();
  webserver.start();

  const servers = await Server.scope('admin').findAll();

  servers.forEach(server => data().addServer(server));
});
