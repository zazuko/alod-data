#!/bin/sh
tdbdump --loc target/tdb | sed '\#example.org#d' | serdi -o ntriples - > target/everything.nt