#!/bin/bash
# strip-ansi.sh — Remove ANSI escape codes from stdin
# Usage: echo "colored text" | strip-ansi.sh
#        cat file.log | strip-ansi.sh

sed \
  -e 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
  -e 's/\x1b\][^\x07]*\x07//g' \
  -e 's/\x1b\[?[0-9;]*[a-zA-Z]//g' \
  -e 's/\x1b(B//g' \
  -e 's/\r//g'
