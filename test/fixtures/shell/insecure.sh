#!/bin/bash
# Intentionally vulnerable fixture for ghas-free-pack acceptance tests.

INPUT=$1

# SC2163: export of a dereferenced variable — exports the *value* as a name
export $INPUT

# Unquoted eval of user input (word splitting / injection)
eval $INPUT

# Unquoted variable in test
if [ $USER == "root" ]; then
    echo "running as root"
fi

# Useless cat + unquoted command substitution
cat /etc/passwd | grep $INPUT
for f in $(ls /tmp); do
    rm $f
done
