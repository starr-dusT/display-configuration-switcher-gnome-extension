/* 
extension.js
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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import { DisplayConfigSwitcher } from './dbus.js';
import { NameDialog } from './dialog.js';

const NAME_INDEX = 0;
const HASH_INDEX = 1;
const LOGICAL_MONITORS_INDEX = 2;
const PROPERTIES_INDEX = 3;
const PHYSICAL_DISPLAYS_INDEX = 4;

const DisplayConfigQuickMenuToggle = GObject.registerClass(
    class DisplayConfigQuickMenuToggle extends QuickSettings.QuickMenuToggle {

        _init(settings) {
            // Set QuickMenu name and icon
            super._init({
                title: 'Displays',
                iconName: 'video-display-symbolic',
                toggleMode: false,
            });
            this.menu.setHeader('video-display-symbolic', 'Display Configuration');

            this._settings = settings;

            this._displayConfigSwitcher = new DisplayConfigSwitcher();
            this._displayConfigSwitcher.connect('state-changed', () => {
                this._updateMenu();
            });
            this._nameDialog = new NameDialog();
            this._dialogHandlerId = null;
            this._configs = this._settings.get_value('configs').deepUnpack();
            this._currentConfigs = [];

            this.connect('clicked', () => this._onClicked());
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
            const activeDisplays = this._displayConfigSwitcher.getPhysicalDisplayInfo();

            this._currentConfigs = [];
            for (let config of this._configs) {
                const displays = config[PHYSICAL_DISPLAYS_INDEX];
                if (displays.every(display =>
                    activeDisplays.some(activeDisplay =>
                        activeDisplay.id.every((element, index) => element === display[index])
                    ))) {
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
                const configItem = new PopupMenu.PopupMenuItem(config[NAME_INDEX]);

                configItem.connect('activate', () => {
                    this._onConfig(config);
                });

                if (config[HASH_INDEX] === currentConfig.hash) {
                    configItem.setOrnament(PopupMenu.Ornament.CHECK);
                    this.subtitle = config[NAME_INDEX];
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

        _saveConfigs() {
            const configsVariant = new GLib.Variant('a(sua(iiduba(ssa{sv}))a{sv}a(ssss))', this._configs);
            this._settings.set_value('configs', configsVariant);
        }

        _onClicked() {
            const nConfigs = this._currentConfigs.length;
            if (nConfigs === 0) {
                return;
            }

            if (this._activeConfig === null) {
                this._onConfig(this._currentConfigs[0]);
                return;
            }

            const currentIndex = this._currentConfigs.indexOf(this._activeConfig);
            const newIndex = currentIndex === (nConfigs - 1) ? 0 : currentIndex + 1;
            this._onConfig(this._currentConfigs[newIndex]);
        }

        _onConfig(config) {
            this._displayConfigSwitcher.applyMonitorsConfig(config[LOGICAL_MONITORS_INDEX], config[PROPERTIES_INDEX]);
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
            this._nameDialog.setName(this._activeConfig[NAME_INDEX]);
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
            this._saveConfigs();
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
            const currentConfigNamed = [
                this._nameDialog.getName(),
                currentConfig.hash,
                currentConfig.logicalMonitors,
                currentConfig.properties,
                currentConfig.physicalDisplays,
            ];

            this._configs.push(currentConfigNamed);
            this._saveConfigs();
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

            const newName = this._nameDialog.getName();

            if (this._activeConfig[NAME_INDEX] !== newName) {
                this._activeConfig[NAME_INDEX] = newName;
                this._saveConfigs();
            }
            this._updateMenu();
        }
    });

export default class DisplayConfigSwitcherExtension extends Extension {
    enable() {
        this._indicator = new QuickSettings.SystemIndicator();
        this._indicator.quickSettingsItems.push(new DisplayConfigQuickMenuToggle(this.getSettings()));
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._indicator = null;
    }
}
