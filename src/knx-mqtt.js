#!/usr/bin/env node
'use strict'

const c = require('./constants.js');
const knx = require('knx');
const { createLogger, format, transports } = require('winston');
const ets = require('./ets-xml');
const config = require('./config.js').parse();
const influx = require('influx');
const logger = createLogger({
  level: config.loglevel,
  format: format.combine(
    format.colorize(),
    format.splat(),
    format.simple(),
  ),
  transports: [new transports.Console()]

  //transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    //new winston.transports.File({ filename: 'error.log', level: 'error' }),
    //new winston.transports.File({ filename: 'combined.log' })
    //new winston.transports.Console({ format: winston.format.simple() })
  //]
});
const messageType = require('./messagetype.js').parse(config.messageType, logger);

let groupAddresses = ets.parse(config.knx.etsExport, logger) || {};

const fields  = {}

for (let key in groupAddresses) {
    if (groupAddresses.hasOwnProperty(key)) {
        // fields[groupAddresses[key].name] = influx.FieldType.FLOAT
        if (groupAddresses[key].dpt === undefined) {
            continue;
        }
        switch (groupAddresses[key].dpt.substring(0,4).toLowerCase()) {
            case 'dpt1':
                fields[groupAddresses[key].name] = influx.FieldType.BOOLEAN
                break;
            case 'dpt2':
                fields[groupAddresses[key].name] = influx.FieldType.INTEGER
                break;
            case 'dpt3':
                fields[groupAddresses[key].name] = influx.FieldType.INTEGER
                break;
            case 'dpt4':
                fields[groupAddresses[key].name] = influx.FieldType.STRING
                break;
            case 'dpt5':
                fields[groupAddresses[key].name] = influx.FieldType.INTEGER
                break;
            case 'dpt9':
                fields[groupAddresses[key].name] = influx.FieldType.FLOAT
                break;
            case 'dpt10':
                fields[groupAddresses[key].name] = influx.FieldType.FLOAT
                break;
            case 'dpt11':
                fields[groupAddresses[key].name] = influx.FieldType.STRING
                break;
            case 'dpt20':
                fields[groupAddresses[key].name] = influx.FieldType.INTEGER
                break;
            case 'dpt21':
                fields[groupAddresses[key].name] = influx.FieldType.INTEGER
                break;
        }
    }
}


const influxConnection = new influx.InfluxDB({
    host: config.influx.host,
    database: config.influx.database,        
    schema: [
        {
            measurement: config.influx.measurement,
            fields: fields,
            tags: [
                'host'
            ]
        }
    ]
    })


let onKnxEvent = function (evt, dst, value, gad) {
    logger.silly("onKnxEvent %s, %s, %j", evt, dst, value);
    if (evt !== 'GroupValue_Write' && evt !== 'GroupValue_Response') {
        return;
    }
    influxConnection.writePoints([
        {
            measurement: config.influx.measurement,
            fields: {[gad.name]: value }
        }
    ])
}

let knxConnection = knx.Connection(Object.assign({
    handlers: {
     connected: function() {
       logger.info('KNX connected');
        for (let key in groupAddresses) {
           if (groupAddresses.hasOwnProperty(key)) {
               if (groupAddresses[key].endpoint) {
                 // We already assigned an endpoint previously and there is no need to do it again here.
                 // This will avoid a possible duplication of messages caused by multiple bound event handles for the same group address.
                 // See https://github.com/pakerfeldt/knx-mqtt-bridge/issues/6 for further details why we really should break here.
                 continue;
               }
               let endpoint = new knx.Datapoint({ga: key, dpt: groupAddresses[key].dpt}, knxConnection);
               groupAddresses[key].endpoint = endpoint;
               groupAddresses[key].unit = endpoint.dpt.subtype !== undefined ? endpoint.dpt.subtype.unit || '' : '';
               groupAddresses[key].endpoint.on('event', function(evt, value) {
                   onKnxEvent(evt, key, value, groupAddresses[key]);
               });
           }
        }
      },
      event: function (evt, src, dst, value) {
          if (!(config.ignoreUnknownGroupAddresses || groupAddresses.hasOwnProperty(dst))) {
              onKnxEvent(evt, dst, value);
          }
      }
  }}, config.knx.options));

  let getBitLength = function(dpt) {
      if (dpt === 'dpt1') {
          return 1;
      } else if (dpt === 'dpt2') {
          return 2;
      } else if (dpt === 'dpt3') {
          return 4;
      } else {
          return undefined;
      }
  }
