#!/bin/sh
ENDPOINT=${ENDPOINT:=http://localhost:5820/alod}
echo "Posting to endpoint: $ENDPOINT"
curl -n \
     -X PUT \
     -H Content-Type:application/n-triples \
     -T target/everything.nt \
     -G $ENDPOINT \
     --data-urlencode graph=http://data.alod.ch/graph/bar