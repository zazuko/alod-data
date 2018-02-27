#!/bin/sh
tdbupdate --loc=target/tdb --update=queries/Record.rq
tdbupdate --loc=target/tdb --update=queries/RecordSet-hasMember.rq