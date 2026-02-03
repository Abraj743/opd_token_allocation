#!/usr/bin/env node

/**
 * Sequential Test Runner
 * 
 * This script runs the OPD system tests in a logical sequence to help you
 * understand how the system works from the ground up.
 */

const { execSync } = require('child_process');
const path = require('path');

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test phases and their files
const testPhases = [
  {
    name: 'Foundation Tests',
    description: 'Basic system components and data layer',
    icon: '🏗️',
    tests: [
      {
        name: 'Database Connection',
        file: '01-foundation/01-database-connection.test.js',
        description: 'MongoDB connectivity and basic operations'
      },
      {
        name: 'Data Models',
        file: '01-foundation/02-models.test.js',
        description: 'Patient, Doctor, TimeSlot, Token, Configuration models'
      },
      {
        name: 'Repository Layer',
        file: '01-foundation/03-repositories.test.js',
        description: 'Data access layer and CRUD operations'
      }
    ]
  },
  {
    name: 'Core Services Tests',
    description: 'Business logic and service layer',
    icon: '⚙️',
    tests: [
      {
        name: 'Priority Calculation',
        file: '02-core-services/01-priority-calculation.test.js',
        description: 'Patient priority calculation algorithms'
      },
      {
        name: 'Slot Management',
        file: '02-core-services/02-slot-management.test.js',
        description: 'Time slot creation, allocation, and management'
      },
      {
        name: 'Token Allocation',
        file: '02-core-services/03-token-allocation.test.js',
        description: 'Core token allocation logic and algorithms'
      }
    ]
  },
  {
    name: 'Integration Tests',
    description: 'Component interactions and workflows',
    icon: '🔗',
    tests: [
      {
        name: 'Basic Allocation Flow',
        file: '03-integration/01-basic-allocation-flow.test.js',
        description: 'End-to-end allocation process and workflows'
      },
      {
        name: 'Emergency Scenarios',
        file: '03-integration/02-emergency-scenarios.test.js',
        description: 'Emergency handling and priority preemption'
      },
      {
        name: 'Concurrency Handling',
        file: '03-integration/03-concurrency-handling.test.js',
        description: 'Multiple simultaneous requests and race conditions'
      }
    ]
  },
  {
    name: 'End-to-End Tests',
    description: 'Complete user scenarios and system validation',
    icon: '🎯',
    tests: [
      {
        name: 'Patient Journey',
        file: '04-end-to-end/01-patient-journey.test.js',
        description: 'Complete patient experience from booking to completion'
      },
      {
        name: 'Doctor Operations',
        file: '04-end-to-end/02-doctor-operations.test.js',
        description: 'Doctor-side operations and schedule management'
      }
    ]
  }
];

class SequentialTestRunner {
  constructor() {
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.startTime = Date.now();
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  logHeader(message) {
    const border = '='.repeat(60);
    this.log(`\n${border}`, 'cyan');
    this.log(`${message}`, 'cyan');
    this.log(`${border}`, 'cyan');
  }

  logPhase(phase) {
    this.log(`\n${phase.icon} ${phase.name}`, 'magenta');
    this.log(`${phase.description}`, 'yellow');
    this.log('-'.repeat(50), 'yellow');
  }

  async runTest(test, phaseIndex, testIndex) {
    const testPath = path.join(__dirname, test.file);
    const testNumber = `${phaseIndex + 1}.${testIndex + 1}`;
    
    this.log(`\n🧪 Test ${testNumber}: ${test.name}`, 'blue');
    this.log(`   ${test.description}`, 'yellow');
    
    try {
      // Run the test using Jest with proper configuration
      // Use relative path from project root instead of absolute path
      const relativePath = `src/test/${test.file}`;
      const command = `npx jest "${relativePath}" --verbose --no-cache --passWithNoTests=false`;
      
      this.log(`   Running: ${test.file}`, 'cyan');
      
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: path.join(__dirname, '../..'),
        timeout: 60000 // 60 second timeout
      });
      
      // More robust success detection
      const lines = output.split('\n');
      
      // Look for Jest's final summary line
      const testSummaryLine = lines.find(line => 
        line.includes('Test Suites:') || 
        (line.includes('Tests:') && (line.includes('passed') || line.includes('failed')))
      );
      
      // Check for PASS/FAIL indicators in the output
      const hasPassFile = output.includes('PASS ') && output.includes(test.file.split('/').pop());
      const hasFailFile = output.includes('FAIL ') && output.includes(test.file.split('/').pop());
      
      // Check for test suite success
      const testSuitesPassed = output.includes('Test Suites:') && 
                              output.includes('passed') && 
                              !output.includes('failed');
      
      // Check for individual test success
      const testsPassedMatch = output.match(/Tests:\s+(\d+)\s+passed/);
      const testsFailedMatch = output.match(/Tests:\s+.*?(\d+)\s+failed/);
      
      const hasPassedTests = testsPassedMatch && parseInt(testsPassedMatch[1]) > 0;
      const hasFailedTests = testsFailedMatch && parseInt(testsFailedMatch[1]) > 0;
      
      // Determine if test passed
      const testPassed = (hasPassFile && !hasFailFile) || 
                        (testSuitesPassed) || 
                        (hasPassedTests && !hasFailedTests);
      
      if (testPassed) {
        this.passedTests++;
        this.log(`   ✅ PASSED: ${test.name}`, 'green');
        
        // Show test summary
        if (testSummaryLine) {
          this.log(`   Summary: ${testSummaryLine.trim()}`, 'green');
        } else if (testsPassedMatch) {
          this.log(`   Summary: ${testsPassedMatch[0]}`, 'green');
        }
        
        return true;
      } else {
        throw new Error(`Test failed - Summary: ${testSummaryLine || 'Test execution failed'}`);
      }
      
    } catch (error) {
      this.failedTests++;
      this.log(`   ❌ FAILED: ${test.name}`, 'red');
      
      // Show error details
      const errorOutput = error.stdout || error.stderr || error.message;
      if (errorOutput) {
        const errorLines = errorOutput.split('\n');
        
        // Look for specific error patterns
        const failLines = errorLines.filter(line => 
          line.includes('FAIL ') || 
          line.includes('● ') ||
          line.includes('Error:') ||
          line.includes('Tests:') ||
          line.includes('Test Suites:') ||
          line.includes('Expected:') ||
          line.includes('Received:') ||
          line.includes('Pattern:') ||
          line.includes('matches')
        );
        
        if (failLines.length > 0) {
          this.log('   Error details:', 'red');
          failLines.slice(0, 10).forEach(line => {
            if (line.trim()) {
              this.log(`     ${line.trim()}`, 'red');
            }
          });
        } else {
          // Fallback: show last few lines of output
          const lastLines = errorLines.slice(-8).filter(line => line.trim());
          if (lastLines.length > 0) {
            this.log('   Last output:', 'red');
            lastLines.forEach(line => {
              this.log(`     ${line.trim()}`, 'red');
            });
          }
        }
      }
      
      return false;
    }
  }

  async runPhase(phase, phaseIndex) {
    this.logPhase(phase);
    
    let phasePassedTests = 0;
    
    for (let testIndex = 0; testIndex < phase.tests.length; testIndex++) {
      const test = phase.tests[testIndex];
      this.totalTests++;
      
      const success = await this.runTest(test, phaseIndex, testIndex);
      if (success) {
        phasePassedTests++;
      }
      
      // Add a small delay between tests for readability
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Phase summary
    const phaseSuccess = phasePassedTests === phase.tests.length;
    const statusIcon = phaseSuccess ? '✅' : '⚠️';
    const statusColor = phaseSuccess ? 'green' : 'yellow';
    
    this.log(`\n${statusIcon} Phase Complete: ${phasePassedTests}/${phase.tests.length} tests passed`, statusColor);
    
    if (!phaseSuccess) {
      this.log('   ⚠️ Some tests failed. You may want to fix issues before proceeding.', 'yellow');
      
      // Ask user if they want to continue
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('   Continue to next phase? (y/n): ', resolve);
      });
      
      rl.close();
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        this.log('\n   Stopping test execution as requested.', 'yellow');
        return false;
      }
    }
    
    return true;
  }

  async runAllTests() {
    this.logHeader('🏥 OPD Token Allocation System - Sequential Test Suite');
    
    this.log('This test suite will help you understand the OPD system step by step.', 'cyan');
    this.log('Each test builds upon the previous ones, showing how components work together.\n', 'cyan');
    
    for (let phaseIndex = 0; phaseIndex < testPhases.length; phaseIndex++) {
      const phase = testPhases[phaseIndex];
      
      const continuePhase = await this.runPhase(phase, phaseIndex);
      if (!continuePhase) {
        break;
      }
      
      // Add delay between phases
      if (phaseIndex < testPhases.length - 1) {
        this.log('\n⏳ Preparing next phase...', 'cyan');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    this.showFinalSummary();
  }

  showFinalSummary() {
    const endTime = Date.now();
    const duration = ((endTime - this.startTime) / 1000).toFixed(2);
    const successRate = ((this.passedTests / this.totalTests) * 100).toFixed(1);
    
    this.logHeader('📊 Final Test Results');
    
    this.log(`Total Tests Run: ${this.totalTests}`, 'cyan');
    this.log(`✅ Passed: ${this.passedTests}`, 'green');
    this.log(`❌ Failed: ${this.failedTests}`, this.failedTests > 0 ? 'red' : 'green');
    this.log(`📈 Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');
    this.log(`⏱️ Total Duration: ${duration} seconds`, 'cyan');
    
    if (this.failedTests === 0) {
      this.log('\n🎉 Congratulations! All tests passed!', 'green');
      this.log('The OPD Token Allocation System is working perfectly.', 'green');
      this.log('You now understand how all the components work together.', 'cyan');
    } else {
      this.log('\n⚠️ Some tests failed.', 'yellow');
      this.log('Review the error messages above to understand what needs attention.', 'yellow');
      this.log('Each test failure indicates a specific area that may need fixes.', 'cyan');
    }
    
    this.log('\n📚 What you learned:', 'cyan');
    this.log('• How the database layer works with MongoDB', 'cyan');
    this.log('• How data models validate and store information', 'cyan');
    this.log('• How repositories abstract database operations', 'cyan');
    this.log('• How priority calculation determines patient order', 'cyan');
    this.log('• How slot management handles time and capacity', 'cyan');
    this.log('• How token allocation manages patient assignments', 'cyan');
    this.log('• How components work together in complete workflows', 'cyan');
    this.log('• How the system handles emergencies and edge cases', 'cyan');
    this.log('• How concurrent operations are managed safely', 'cyan');
    this.log('• How complete patient and doctor journeys work', 'cyan');
    
    this.log('\n🚀 Next Steps:', 'magenta');
    this.log('• Run individual tests to debug specific issues', 'magenta');
    this.log('• Examine the test code to understand implementation details', 'magenta');
    this.log('• Use the comprehensive test script for full system validation', 'magenta');
    this.log('• Start building your own features using these patterns', 'magenta');
  }

  async showMenu() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    this.logHeader('🏥 OPD System Test Menu');
    
    this.log('Choose how you want to run the tests:\n', 'cyan');
    this.log('1. 🚀 Run all tests sequentially (Recommended for learning)', 'green');
    this.log('2. 🏗️ Run only Foundation tests (Database, Models, Repositories)', 'yellow');
    this.log('3. ⚙️ Run only Core Services tests (Priority, Slot Management, Token Allocation)', 'yellow');
    this.log('4. 🔗 Run only Integration tests (Workflows, Emergency, Concurrency)', 'yellow');
    this.log('5. 🎯 Run only End-to-End tests (Patient Journey, Doctor Operations)', 'yellow');
    this.log('6. 📋 Show test structure and exit', 'blue');
    this.log('7. ❌ Exit', 'red');
    
    const choice = await new Promise(resolve => {
      rl.question('\nEnter your choice (1-7): ', resolve);
    });
    
    rl.close();
    
    switch (choice) {
      case '1':
        await this.runAllTests();
        break;
      case '2':
        await this.runPhase(testPhases[0], 0);
        this.showFinalSummary();
        break;
      case '3':
        await this.runPhase(testPhases[1], 1);
        this.showFinalSummary();
        break;
      case '4':
        await this.runPhase(testPhases[2], 2);
        this.showFinalSummary();
        break;
      case '5':
        await this.runPhase(testPhases[3], 3);
        this.showFinalSummary();
        break;
      case '6':
        this.showTestStructure();
        break;
      case '7':
        this.log('Goodbye! 👋', 'cyan');
        break;
      default:
        this.log('Invalid choice. Please run the script again.', 'red');
    }
  }

  showTestStructure() {
    this.logHeader('📋 Test Structure Overview');
    
    testPhases.forEach((phase, phaseIndex) => {
      this.log(`\n${phase.icon} Phase ${phaseIndex + 1}: ${phase.name}`, 'magenta');
      this.log(`   ${phase.description}`, 'yellow');
      
      phase.tests.forEach((test, testIndex) => {
        this.log(`   ${phaseIndex + 1}.${testIndex + 1} ${test.name}`, 'cyan');
        this.log(`       ${test.description}`, 'yellow');
        this.log(`       File: ${test.file}`, 'blue');
      });
    });
    
    this.log('\n📝 How to run individual tests:', 'cyan');
    this.log('npm test -- src/test/01-foundation/01-database-connection.test.js', 'green');
    this.log('npm test -- src/test/02-core-services/01-priority-calculation.test.js', 'green');
    this.log('npm test -- src/test/03-integration/01-basic-allocation-flow.test.js', 'green');
    this.log('npm test -- src/test/04-end-to-end/01-patient-journey.test.js', 'green');
    
    this.log('\n📝 How to run test categories:', 'cyan');
    this.log('npm test -- src/test/01-foundation/', 'green');
    this.log('npm test -- src/test/02-core-services/', 'green');
    this.log('npm test -- src/test/03-integration/', 'green');
    this.log('npm test -- src/test/04-end-to-end/', 'green');
  }
}

// Main execution
async function main() {
  const runner = new SequentialTestRunner();
  
  // Check if command line arguments specify what to run
  const args = process.argv.slice(2);
  
  if (args.includes('--all')) {
    await runner.runAllTests();
  } else if (args.includes('--foundation')) {
    await runner.runPhase(testPhases[0], 0);
    runner.showFinalSummary();
  } else if (args.includes('--services')) {
    await runner.runPhase(testPhases[1], 1);
    runner.showFinalSummary();
  } else if (args.includes('--integration')) {
    await runner.runPhase(testPhases[2], 2);
    runner.showFinalSummary();
  } else if (args.includes('--end-to-end')) {
    await runner.runPhase(testPhases[3], 3);
    runner.showFinalSummary();
  } else if (args.includes('--structure')) {
    runner.showTestStructure();
  } else {
    // Show interactive menu
    await runner.showMenu();
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Test execution interrupted. Goodbye!');
  process.exit(0);
});

// Run the main function
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});