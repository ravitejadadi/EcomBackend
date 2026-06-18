import dns from 'dns';

console.log("Before:", dns.getServers());

dns.setServers(['8.8.8.8']);

console.log("After:", dns.getServers());

dns.resolveSrv(
  '_mongodb._tcp.cluster0.myv7cis.mongodb.net',
  (err, records) => {
    console.log(err);
    console.log(records);
  }
);