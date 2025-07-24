const React = require('react');

describe('App Component', () => {
	test('App module can be required without errors', () => {
		expect(() => {
			const App = require('../../../../src/ui/App.js');
			expect(typeof App).toBe('function');
		}).not.toThrow();
	});

	test('AppContext can be required without errors', () => {
		expect(() => {
			const { AppProvider, useAppContext } = require('../../../../src/ui/contexts/AppContext.js');
			expect(typeof AppProvider).toBe('function');
			expect(typeof useAppContext).toBe('function');
		}).not.toThrow();
	});

	test('UI components can be required without errors', () => {
		expect(() => {
			const PipelineStatus = require('../../../../src/ui/components/PipelineStatus.jsx');
			const Results = require('../../../../src/ui/components/Results.jsx');
			const SummaryTable = require('../../../../src/ui/components/SummaryTable.jsx');
			const StaticLog = require('../../../../src/ui/components/StaticLog.jsx');
			
			expect(typeof PipelineStatus).toBe('function');
			expect(typeof Results).toBe('function');
			expect(typeof SummaryTable).toBe('function');
			expect(typeof StaticLog).toBe('function');
		}).not.toThrow();
	});

	test('usePipeline hook can be required without errors', () => {
		expect(() => {
			const usePipeline = require('../../../../src/ui/hooks/usePipeline.js');
			expect(typeof usePipeline).toBe('function');
		}).not.toThrow();
	});
});