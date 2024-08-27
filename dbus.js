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

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

export const DisplayConfigSwitcher = GObject.registerClass({
    Signals: {
        'state-changed': {},
    },
}, class DisplayConfigSwitcher extends GObject.Object {
    constructor(constructProperties = {}) {
        super(constructProperties);
        this._currentState = null;

        this._initProxy();
    }

    async _initProxy() {
        Gio._promisify(Gio.DBusProxy, 'new_for_bus');

        this._proxy = await Gio.DBusProxy.new_for_bus(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            null
        );

        Gio._promisify(this._proxy, 'call');

        this._proxy.connect('g-signal::MonitorsChanged',
            () => {
                this._updateState();
            });

        this._updateState();
    }

    getMonitorsConfig() {
        if (this._currentState === null) { return null; }

        const config = {};

        config.properties = {};
        const properties = this._currentState[3];


        if (properties["supports-changing-layout-mode"] === true) {
            const layoutMode = properties["layout-mode"];
            if (layoutMode !== undefined) {
                // Immediately save a{sv} values as GVariant for easy packing later
                config.properties["layout-mode"] = GLib.Variant.new_uint32(layoutMode);
            }
        }

        config.logicalMonitors = this._getUpdatedLogicalMonitors();

        const physicalDisplays = this.getPhysicalDisplayInfo();
        config.physicalDisplays = physicalDisplays.map(v => v.id);

        // Use GVariant string representation for generating hash
        const tempVariant = new GLib.Variant('(a(iiduba(ssa{sv}))a{sv}a(ssss))', [
            config.logicalMonitors,
            config.properties,
            config.physicalDisplays
        ]);
        config.hash = (new GLib.String(tempVariant.print(false))).hash();

        return config;
    }

    async applyMonitorsConfig(logicalMonitors, properties, usePrompt = false) {
        if (this._proxy === null) {
            log('Proxy is not initialized');
            return;
        }

        const parameters = new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [
            this._currentState[0],
            usePrompt ? 2 : 1,
            logicalMonitors,
            properties,
        ]);

        this._proxy.call(
            'ApplyMonitorsConfig',
            parameters,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
    }

    async _updateState() {
        const reply = await this._proxy.call(
            'GetCurrentState',
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
        this._currentState = reply.recursiveUnpack();
        this.emit('state-changed');
    }

    getPhysicalDisplayInfo() {
        if (this._currentState === null) { return null; }

        const monitors = this._currentState[1];
        const displays = [];

        for (let monitor of monitors) {
            const [id, modes, props] = monitor;
            const display = {};

            display.id = id;
            display.props = {};

            const enableUnderscanning = props["is-underscanning"];
            if (enableUnderscanning !== undefined) {
                // Immediately save a{sv} values as GVariant for easy packing later
                display.props["underscanning"] = GLib.Variant.new_boolean(enableUnderscanning);
            }
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

    _getUpdatedLogicalMonitors() {
        if (this._currentState === null) {
            return null;
        }

        const logicalMonitors = this._currentState[2];
        const updatedLogicalMonitors = [];
        const displays = this.getPhysicalDisplayInfo();

        for (let logicalMonitor of logicalMonitors) {
            const [x, y, scale, transform, primary, monitors,] = logicalMonitor;
            const updatedLogicalMonitor = [x, y, scale, transform, primary, []]
            for (let monitor of monitors) {
                const id = monitor;
                for (let disp of displays) {
                    if (id.every((element, index) => element === disp.id[index])) {
                        updatedLogicalMonitor[5].push([disp.id[0], disp.mode_id, disp.props]);
                    }
                }
            }
            // Make sure to sort for correct hash later
            updatedLogicalMonitor[5].sort();
            updatedLogicalMonitors.push(updatedLogicalMonitor);
        }
        // Make sure to sort for correct hash later
        updatedLogicalMonitors.sort();
        return updatedLogicalMonitors;
    }

});
