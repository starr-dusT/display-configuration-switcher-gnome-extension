/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */


import GObject from 'gi://GObject';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {DisplayConfigSwitcher} from './dbus.js';
import {NameDialog} from './dialog.js';

const DisplayConfigQuickMenuToggle = GObject.registerClass(
    class DisplayConfigQuickMenuToggle extends QuickSettings.QuickMenuToggle {

        _init() {
            // Set QuickMenu name and icon
            super._init({
                title: 'Displays',
                iconName: 'video-display-symbolic',
                toggleMode: false,
            });
            this.menu.setHeader('video-display-symbolic', 'Display Configuration');
            
            this._displayConfigSwitcher = new DisplayConfigSwitcher();
            this._displayConfigSwitcher.connect('state-changed', () => {
                this._updateMenu();
            });
            this._nameDialog = new NameDialog();
            this._dialogHandlerId = null;
            this._configs = [];
            this._currentConfigs = [];
        }

        _addDummyItem(message) {
            const item = new PopupMenu.PopupMenuItem(message);
            item.label.get_clutter_text().set_line_wrap(true);
            this.menu.addMenuItem(item);
        }

        _updateMenu() {
            this.menu.removeAll();

            this._filterConfigs();
            this._addConfigItems();

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._addModifyItems();
        }

        _filterConfigs() {
            const displays = this._displayConfigSwitcher.getPhysicalDisplayInfo();

            this._currentConfigs = [];
            for (let config of this._configs) {
                if (config.logicalMonitors.every((logicalMonitor) => {
                    const [ , , , , , monitors, ] = logicalMonitor;
                    return monitors.every((monitor) => 
                        displays.some((display) =>
                            monitor.every((element, index) => element === display.id[index])
                        )
                    );
                })) {
                    this._currentConfigs.push(config);
                }
            };
        }

        _addConfigItems() {
            this.subtitle = null;
            this.checked = false;
            this._activeConfig = null;

            if (this._configs.length === 0) {
                this._addDummyItem("No configurations saved for this display setup.");
                return;
            }

            const currentConfig = this._displayConfigSwitcher.getMonitorsConfig();

            for (let config of this._currentConfigs) {
                const configItem = new PopupMenu.PopupMenuItem(config.name);
                
                configItem.connect('activate', () => {
                    this._onConfig(config);
                });

                if (config.hash === currentConfig.hash) {
                    configItem.setOrnament(PopupMenu.Ornament.CHECK);
                    this.subtitle = config.name;
                    this.checked = true;
                    this._activeConfig = config;
                }
    
                this.menu.addMenuItem(configItem);
            }
        }

        _addModifyItems() {
            if (this._activeConfig === null) {
                const addConfigItem = new PopupMenu.PopupImageMenuItem(_("Add Configuration"), 'list-add-symbolic');
                addConfigItem.connect('activate', () => {
                    this._onAddConfig();
                });
                this.menu.addMenuItem(addConfigItem);
            } else {
                const renameConfigItem = new PopupMenu.PopupImageMenuItem(_("Rename Configuration"), 'document-edit-symbolic');
                renameConfigItem.connect('activate', () => {
                    this._onRenameConfig();
                });
                this.menu.addMenuItem(renameConfigItem);
                
                const removeConfigItem = new PopupMenu.PopupImageMenuItem(_("Remove Configuration"), 'list-remove-symbolic');
                removeConfigItem.connect('activate', () => {
                    this._onRemoveConfig();
                });
                this.menu.addMenuItem(removeConfigItem);
            }
        }

        _onConfig(config) {
            this._displayConfigSwitcher.applyMonitorsConfig(config.serial, config.logicalMonitors);
        }

        _onAddConfig() {
            this._nameDialog.setMessage(_("Enter a name for the current configuration."));
            this._nameDialog.setName("");
            this._dialogHandlerId = this._nameDialog.connect('closed', () => {
                this._onNameDialogClosed();
            });
            this._nameDialog.open();
        }

        _onRenameConfig() {
            this._nameDialog.setMessage(_("Enter a new name for the current configuration."));
            this._nameDialog.setName(this._activeConfig.name);
            this._dialogHandlerId = this._nameDialog.connect('closed', () => {
                this._onRenameDialogClosed();
            });
            this._nameDialog.open();
        }

        _onRemoveConfig() {
            const index = this._configs.indexOf(this._activeConfig);
            if (index !== -1) {
                this._configs.splice(index, 1);
            }
            this._updateMenu();
        }

        _onNameDialogClosed() {
            if (this._dialogHandlerId) {
                this._nameDialog.disconnect(this._dialogHandlerId);
                this._dialogHandlerId = null;
            }

            if (!this._nameDialog.isValid()) {
                return;
            }

            const currentConfig = this._displayConfigSwitcher.getMonitorsConfig();
            currentConfig.name = this._nameDialog.getName();
            this._configs.push(currentConfig);
            this._updateMenu();
        }

        _onRenameDialogClosed() {
            if (this._dialogHandlerId) {
                this._nameDialog.disconnect(this._dialogHandlerId);
                this._dialogHandlerId = null;
            }

            if (!this._nameDialog.isValid()) {
                return;
            }

            this._activeConfig.name = this._nameDialog.getName();
            this._updateMenu();
        }
    });

export default class DisplayConfigSwitcherExtension extends Extension {
    enable() {
        this._indicator = new QuickSettings.SystemIndicator();
        this._indicator.quickSettingsItems.push(new DisplayConfigQuickMenuToggle());
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._indicator = null;
    }
}
