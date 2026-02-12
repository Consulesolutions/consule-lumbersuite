module.exports = {
  defaultProjectFolder: 'src',
  commands: {
    'project:deploy': {
      // Override deploy command defaults here if needed
    },
    'object:import': {
      // Paths for object import
      destinationfolder: '/Objects/'
    },
    'file:import': {
      paths: ['/SuiteScripts/ConsuleLumberSuite']
    }
  }
};
