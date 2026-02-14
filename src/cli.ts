#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('smartb')
  .description('AI observability diagrams -- see what your AI is thinking')
  .version('0.1.0');

program.parse();
