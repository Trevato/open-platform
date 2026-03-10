#!/bin/sh
node ws-server.js &
exec node server.js
