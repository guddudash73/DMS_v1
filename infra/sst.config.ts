export default $config({
  app() {
    return { name: 'dms', home: 'aws' };
  },
  async run() {
    await import('./stacks/AppStack.js'); // NodeNext requires .js extension
  },
});
