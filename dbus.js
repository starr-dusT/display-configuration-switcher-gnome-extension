/* 
dbus.js
Copyright (C) 2024 Christophe Van den Abbeele

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const { Gio } = imports.gi;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;

const DisplayConfigInterface = 
    '<node>\
        <interface name="org.gnome.Mutter.DisplayConfig">\
            <property name="ApplyMonitorsConfigAllowed" type="b" access="read" />\
            <signal name="MonitorsChanged" />\
            <method name="GetCurrentState">\
                <arg name="serial" direction="out" type="u" />\
                <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />\
                <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />\
                <arg name="properties" direction="out" type="a{sv}" />\
            </method>\
            <method name="ApplyMonitorsConfig">\
                <arg name="serial" direction="in" type="u" />\
                <arg name="method" direction="in" type="u" />\
                <arg name="logical_monitors" direction="in" type="a(iiduba(ssa{sv}))" />\
                <arg name="properties" direction="in" type="a{sv}" />\
            </method>\
        </interface>\
    </node>';


export const DisplayConfigSwitcher = GObject.registerClass({
    Signals: {
        'state-changed': {},
    },
}, class DisplayConfigSwitcher extends GObject.Object {
    constructor(constructProperties = {}) {
        super(constructProperties);
        this._currentState = null;

        const DisplayConfigProxy = Gio.DBusProxy.makeProxyWrapper(DisplayConfigInterface);


        this._proxy = new DisplayConfigProxy(
            Gio.DBus.session,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            (proxy, error) => {
                if (error) {
                    log(error.message);
                } else {
                    this._proxy.connectSignal('MonitorsChanged',
                        () => {
                            this._updateState();
                        });
                    this._updateState();
                }
            });
    }

    getMonitorsConfig() {
        const config = {
            serial: this._currentState[0],
            logicalMonitors: this._currentState[2],
            properties: this._currentState[3],
        };

        const allKeys = [];
        JSON.stringify(config, (k, v) => { allKeys.push(k); return v; });
        const sortedString = JSON.stringify(config, allKeys.sort());
        config.hash = (new GLib.String(sortedString)).hash();

        return config;
    }

    applyMonitorsConfig(serial, logicalMonitors, usePrompt = false, properties = {}) {
        if (this._proxy === null) {
            log('Proxy is not initialized');
            return;
        }

        this._proxy.ApplyMonitorsConfigRemote(
            serial,
            usePrompt ? 2 : 1,
            this._logicalMonitorsInputToOutput(logicalMonitors),
            properties);
    }

    _updateState() {
        if (this._proxy === null) {
            log('Proxy is not initialized');
            return;
        }

        this._proxy.GetCurrentStateRemote((returnValue, errorObj) => {
            if (errorObj === null) {
                this._currentState = returnValue;
                this.emit('state-changed');
            } else {
                this._currentState = null;
                logError(errorObj);
            }
        });
    }

    getPhysicalDisplayInfo() {
        if (this._currentState === null) {
            return null;
        }
        const [, monitors, , ] = this._currentState;
        const displays = [];

        for (let monitor of monitors) {
            const [id, modes, ] = monitor;
            const display = {};

            display.id = id;

            for (let mode of modes) {
                const [mode_id, , , , , , opt_props] = mode;
                if (opt_props['is-current']) {
                    display.mode_id = mode_id;
                }
            }

            displays.push(display);
        }
        return displays;
    }

    _logicalMonitorsInputToOutput(logicalMonitors) {
        if (this._currentState === null) {
            return null;
        }
        
        const updatedLogicalMonitors = [];
        const displays = this.getPhysicalDisplayInfo();

        for (let disp of displays) {
            for (let logicalMonitor of logicalMonitors) {
                const [x, y, scale, transform, primary, monitors, ] = logicalMonitor;
                for (let monitor of monitors) {
                    const id = monitor;
                    if (id.every((element, index) => element === disp.id[index])) {
                        updatedLogicalMonitors.push([x, y, scale, transform, primary, [[disp.id[0], disp.mode_id, {}]]]);
                    }
                }
            }
        }
        return updatedLogicalMonitors;
    }

});
