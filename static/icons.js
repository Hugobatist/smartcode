/* SmartB Diagrams — SVG Icon System */
/* Lucide-based icons (MIT), stroke=currentColor, 24x24 viewBox at 16x16 */

(function () {
    'use strict';

    var SIZE = 16;
    var ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="' + SIZE + '" height="' + SIZE +
        '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    window.SmartBIcons = {
        folder: '<svg ' + ATTRS + '><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',

        folderOpen: '<svg ' + ATTRS + '><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',

        file: '<svg ' + ATTRS + '><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',

        save: '<svg ' + ATTRS + '><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>',

        plus: '<svg ' + ATTRS + '><path d="M5 12h14"/><path d="M12 5v14"/></svg>',

        chevronRight: '<svg ' + ATTRS + '><path d="m9 18 6-6-6-6"/></svg>',

        chevronDown: '<svg ' + ATTRS + '><path d="m6 9 6 6 6-6"/></svg>',

        edit: '<svg ' + ATTRS + '><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>',

        trash: '<svg ' + ATTRS + '><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',

        close: '<svg ' + ATTRS + '><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',

        arrowUp: '<svg ' + ATTRS + '><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>',

        arrowDown: '<svg ' + ATTRS + '><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',

        arrowRight: '<svg ' + ATTRS + '><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',

        chart: '<svg ' + ATTRS + '><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>',

        diamond: '<svg ' + ATTRS + '><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/></svg>',

        help: '<svg ' + ATTRS + '><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',

        flag: '<svg ' + ATTRS + '><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>',

        sidebar: '<svg ' + ATTRS + '><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>',

        editor: '<svg ' + ATTRS + '><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',

        eye: '<svg ' + ATTRS + '><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>',

        download: '<svg ' + ATTRS + '><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',

        image: '<svg ' + ATTRS + '><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',

        sync: '<svg ' + ATTRS + '><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',

        ghost: '<svg ' + ATTRS + ' style="opacity:0.7"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>',

        heatmap: '<svg ' + ATTRS + '><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>',

        play: '<svg ' + ATTRS + '><polygon points="6 3 20 12 6 21 6 3"/></svg>',

        node: '<svg ' + ATTRS + '><rect width="16" height="10" x="4" y="7" rx="2"/><circle cx="12" cy="12" r="1"/></svg>',
    };
})();
