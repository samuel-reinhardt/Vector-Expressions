/**
 * Vector Expressions — Block Editor UI Entry Point
 *
 * This file is the build entry point (compiled by scripts/build.mjs).
 * It wires up the three feature modules and has no logic of its own.
 *
 * Do not edit the compiled output in dist/ directly.
 */

import { registerExpressionFormat } from './expression-format.jsx';
import { registerAutocompleter }    from './autocompleter.js';
import { registerLogicPanel }       from './logic-panel.jsx';

registerExpressionFormat();
registerAutocompleter();
registerLogicPanel();
