/* 
prefs.js
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

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const NAME_INDEX = 0;
const HASH_INDEX = 1;
const LOGICAL_MONITORS_INDEX = 2;
const PROPERTIES_INDEX = 3;
const PHYSICAL_DISPLAYS_INDEX = 4;

export default class DisplayConfigSwitcherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Create a preferences page, with a single group
        this._configs = [];
        this._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const configGroup = new Adw.PreferencesGroup({
            title: _('Saved Configurations'),
            description: _('Rename or remove the saved display configurations.'),
        });
        page.add(configGroup);

        this._configListBox = new Gtk.ListBox();
        this._configListBox.add_css_class("boxed-list");
        configGroup.add(this._configListBox);

        // Drag and Drop: Drop Handling
        const dropTarget = Gtk.DropTarget.new(GObject.TYPE_INT, Gdk.DragAction.MOVE);
        this._configListBox.add_controller(dropTarget);

        dropTarget.connect("drop", (_drop, value, _x, y) => {
            const targetRow = this._configListBox.get_row_at_y(y);
            if (!targetRow || value > this._configs.length - 1) {
                return false;
            }
            const targetIndex = targetRow.get_index();
            const sourceIndex = value;

            const sourceConfig = this._configs.splice(sourceIndex, 1)[0];

            this._configs.splice(targetIndex, 0, sourceConfig);

            this._saveConfigs();

            return true;
        })

        window.connect('close-request', () => {
            this._configs = null;
            this._settings = null;
            this._configListBox = null;
        });

        this._settings.connect('changed::configs', () => {
            this.onConfigsChanged();
        });

        this.onConfigsChanged();
    }

    onConfigsChanged() {
        this._configs = this._settings.get_value('configs').deepUnpack();

        this._updateConfigGroup();
    }

    _saveConfigs() {
        const configsVariant = new GLib.Variant('a(sua(iiduba(ssa{sv}))a{sv}a(ssss))', this._configs);
        this._settings.set_value('configs', configsVariant);
    }

    _prettyPrintConfig(config) {
        const hash = config[HASH_INDEX];
        const logicalMonitors = config[LOGICAL_MONITORS_INDEX];
        const properties = config[PROPERTIES_INDEX];
        const physicalDisplays = config[PHYSICAL_DISPLAYS_INDEX];
        let res = '';

        res += 'Logical monitors:\n';
        for (const [index, logicalMonitor] of logicalMonitors.entries()) {
            res +=
                `${index + 1})\t(x, y) = (${logicalMonitor[0]}, ${logicalMonitor[1]})\n` +
                `\tscale = ${logicalMonitor[2]}\n` +
                `\ttransform = ${logicalMonitor[3]}\n` +
                `\tprimary = ${logicalMonitor[4]}\n` +
                `\tmonitors:\n`;
            for (const [index, monitor] of logicalMonitor[5].entries()) {
                res +=
                    `\t${index + 1})\t- connector = ${monitor[0]}\n` +
                    `\t\t- monitor mode ID = ${monitor[1]}\n`;
                const underscanning = monitor[2]['underscanning'];
                if (underscanning !== undefined) {
                    res += `\t\t- underscanning = ${underscanning.get_boolean()}\n`;
                }
            }
        }

        res += 'Properties:\n';
        const layoutMode = properties['layout-mode'];
        if (layoutMode !== undefined) {
            res += `\tlayout-mode = ${layoutMode.get_uint32()}\n`;
        }

        res += 'Physical displays:\n';
        for (const [index, display] of physicalDisplays.entries()) {
            res +=
                `${index + 1})\t- connector = ${display[0]}\n` +
                `\t- vendor = ${display[1]}\n` +
                `\t- product = ${display[2]}\n` +
                `\t- serial = ${display[3]}\n`
        }

        res += `Config hash: ${hash}`;

        return res;
    }

    _updateConfigGroup() {
        let row;
        while ((row = this._configListBox.get_last_child()) !== null) {
            this._configListBox.remove(row);
        }

        for (const [index, config] of this._configs.entries()) {
            const row = new Adw.EntryRow({
                text: config[NAME_INDEX],
                title: _('Configuration Name'),
                show_apply_button: true,
            });
            row.connect('apply', () => { this.onEditApply(index); });

            row.add_prefix(new Gtk.Image({
                icon_name: "list-drag-handle-symbolic"
            }));

            const infoButton = new Gtk.MenuButton({
                icon_name: 'dialog-information-symbolic',
                valign: Gtk.Align.CENTER
            });

            const infoPopover = new Gtk.Popover();

            const infoLabel = new Gtk.Label({
                label: this._prettyPrintConfig(config)
            });

            infoPopover.set_child(infoLabel);
            infoButton.set_popover(infoPopover);

            row.add_suffix(infoButton);

            const removeButton = new Gtk.Button({
                icon_name: 'list-remove-symbolic',
                valign: Gtk.Align.CENTER
            });

            removeButton.connect('clicked', () => { this.onRemoveClicked(index); });
            removeButton.add_css_class('destructive-action');

            row.add_suffix(removeButton);

            // Implement Drag and Drop
            const dropController = new Gtk.DropControllerMotion();
            const dragSource = new Gtk.DragSource({
                actions: Gdk.DragAction.MOVE,
            });
            row.add_controller(dragSource);
            row.add_controller(dropController);

            let dragX;
            let dragY;

            dragSource.connect("prepare", (_source, x, y) => {
                dragX = x;
                dragY = y;

                const value = new GObject.Value();
                value.init(GObject.TYPE_INT);
                value.set_int(index);

                return Gdk.ContentProvider.new_for_value(value);
            });

            dragSource.connect("drag-begin", (_source, drag) => {
                const dragWidget = new Gtk.ListBox();

                dragWidget.set_size_request(row.get_width(), row.get_height());
                dragWidget.add_css_class("boxed-list");

                const dragRow = new Adw.EntryRow({
                    text: config[NAME_INDEX],
                    title: _('Configuration Name'),
                    show_apply_button: true,
                });
                dragRow.add_prefix(new Gtk.Image({
                    icon_name: "list-drag-handle-symbolic"
                }));

                dragWidget.append(dragRow);
                dragWidget.drag_highlight_row(dragRow);

                const icon = Gtk.DragIcon.get_for_drag(drag);
                icon.child = dragWidget;

                drag.set_hotspot(dragX, dragY);
            });

            dropController.connect("enter", () => {
                this._configListBox.drag_highlight_row(row);
            });

            dropController.connect("leave", () => {
                this._configListBox.drag_unhighlight_row();
            });


            this._configListBox.append(row);
        }
    }

    onEditApply(index) {
        this._configs[index][NAME_INDEX] = this._configListBox.get_row_at_index(index).get_text();
        this._saveConfigs();
    }

    onRemoveClicked(index) {
        this._configs.splice(index, 1);
        this._saveConfigs();
    }
}
