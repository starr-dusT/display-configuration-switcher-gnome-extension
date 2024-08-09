#!/bin/bash

# build.sh
# Copyright (C) 2024 Christophe Van den Abbeele

# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.

# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.


function Help()
{
    echo "Usage: $(basename $0) [-bil]."
    echo "  -b  build the extension"
    echo "  -i  install the extension"
    echo "  -l  log out gnome session afterwards"
}

build=""
install=""

while getopts ":bil" option; do
    case $option in
    b)
        build=1;;
    i)
        install=1;;
    l)
        logout=1;;
    *)
        Help
        exit
        ;;
    esac
done


if [[ $build ]]; then
    EXTRA_SOURCES=""
    for SCRIPT in *.js; do
        EXTRA_SOURCES="${EXTRA_SOURCES} --extra-source=${SCRIPT}"
    done
    
    gnome-extensions pack --force $EXTRA_SOURCES
fi

if [[ $install ]]; then
    gnome-extensions install --force *.zip
fi

if [[ $logout  ]]; then
    gnome-session-quit --logout --no-prompt
fi
