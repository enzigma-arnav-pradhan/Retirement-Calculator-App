import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface AdHocInvestment {
  year: number;
  amount: number;
}

interface LedgerRow {
  year: number;
  age: number;
  openingBalance: number;
  contributions: number;
  growth: number;
  withdrawals: number;
  closingBalance: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit {
  title = 'Retirement Planning Dashboard';
  Math = Math;

  // Input Fields
  currentAge: number = 30;
  retirementAge: number = 60;
  lifeExpectancy: number = 85;
  monthlyExpenseToday: number = 50000;
  inflationRate: number = 6;
  expectedReturnPre: number = 12; // Pre-retirement Expected Return
  expectedReturnPost: number = 7.5; // Post-retirement Expected Return
  withdrawalRate: number = 4; // Safe Withdrawal Rate (SWR)
  retirementTax: number = 10; // Retirement withdrawal tax rate %
  emergencyBufferMonths: number = 12; // Months of expenses as liquid buffer
  currentCorpus: number = 500000;
  oneTimeInvestment: number = 100000;
  monthlySIP: number = 20000;
  sipStepUp: number = 5; // Annual SIP step-up %
  depletionAge: number = -1; // Age when corpus runs out
  inheritance: number = 0; // Surplus estate at life expectancy

  adHocInvestments: AdHocInvestment[] = [
    { year: 5, amount: 200000 },
    { year: 10, amount: 500000 }
  ];

  // Localization Config
  selectedCountryName: string = 'India';
  countriesConfig = [
    {
      name: 'India',
      locale: 'en-IN',
      currency: 'INR',
      symbol: '₹',
      defaultInflation: 6.0,
      defaultTax: 10,
      defaultReturnPre: 12.0,
      defaultReturnPost: 7.5,
      sipLabel: 'Monthly SIP',
      stepUpLabel: 'Annual SIP Step-Up (%)',
      lumpSumLabel: 'One-time Lump Sum Today',
      taxLabel: 'Retirement Income Tax',
      corpusLabel: 'Retirement Corpus'
    },
    {
      name: 'United States',
      locale: 'en-US',
      currency: 'USD',
      symbol: '$',
      defaultInflation: 2.5,
      defaultTax: 15,
      defaultReturnPre: 8.5,
      defaultReturnPost: 5.5,
      sipLabel: 'Monthly 401(k) / IRA Saving',
      stepUpLabel: 'Annual Savings Increase (%)',
      lumpSumLabel: 'One-time Deposit Today',
      taxLabel: 'Retirement Income Tax',
      corpusLabel: '401(k) / IRA Portfolio'
    }
  ];

  get currentCountry() {
    return this.countriesConfig.find(c => c.name === this.selectedCountryName) || this.countriesConfig[0];
  }

  // Calculated Output Fields
  targetCorpus: number = 0;
  projectedCorpus: number = 0;
  shortfallOrSurplus: number = 0;
  requiredSIP: number = 0;
  requiredOneTime: number = 0;
  timeToReachCorpus: string = '';
  totalInvested: number = 0;
  investmentGrowth: number = 0;

  // View state
  activeTab: 'charts' | 'ledger' | 'guide' = 'charts';

  ledger: LedgerRow[] = [];

  // Chart References
  @ViewChild('corpusChartCanvas', { static: false }) corpusChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('contribChartCanvas', { static: false }) contribChartCanvas!: ElementRef<HTMLCanvasElement>;

  private corpusChart: Chart | null = null;
  private contribChart: Chart | null = null;
  private chartsInitialized: boolean = false;

  ngOnInit() {
    this.calculate();
  }

  ngAfterViewInit() {
    this.chartsInitialized = true;
    // Small delay to ensure DOM is fully ready
    setTimeout(() => {
      this.calculate();
    }, 0);
  }

  calculate() {
    // Input sanitization and bounds checking
    const cAge = Math.max(0, this.currentAge || 0);
    let rAge = Math.max(cAge + 1, this.retirementAge || 0);
    let lExp = Math.max(rAge + 1, this.lifeExpectancy || 0);

    // Keep inputs in sync if they exceed bounds
    if (this.retirementAge < cAge + 1) this.retirementAge = cAge + 1;
    if (this.lifeExpectancy < rAge + 1) this.lifeExpectancy = rAge + 1;

    const nAcc = rAge - cAge;
    const nRet = lExp - rAge;

    const monthlyExpenseTodaySafe = this.monthlyExpenseToday || 0;
    const inflationRateSafe = this.inflationRate || 0;
    const withdrawalRateSafe = this.withdrawalRate || 4;
    const currentCorpusSafe = this.currentCorpus || 0;
    const oneTimeInvestmentSafe = this.oneTimeInvestment || 0;
    const monthlySIPSafe = this.monthlySIP || 0;
    const sipStepUpSafe = this.sipStepUp || 0;
    const expectedReturnPreSafe = this.expectedReturnPre || 0;
    const expectedReturnPostSafe = this.expectedReturnPost || 0;
    const retirementTaxSafe = Math.min(99, Math.max(0, this.retirementTax || 0));
    const emergencyBufferMonthsSafe = Math.max(0, this.emergencyBufferMonths || 0);

    // 1. Target Corpus (SWR based + Emergency Buffer + Tax adjustments)
    // Monthly expense inflated to retirement age
    const monthlyExpenseAtRetirementNet = monthlyExpenseTodaySafe * Math.pow(1 + inflationRateSafe / 100, nAcc);
    // Gross up monthly expense to cover withdrawal tax
    const monthlyExpenseAtRetirementGross = monthlyExpenseAtRetirementNet / (1 - retirementTaxSafe / 100);
    const annualExpenseAtRetirementGross = monthlyExpenseAtRetirementGross * 12;
    
    // Core SWR Corpus
    const swrCorpus = annualExpenseAtRetirementGross / (withdrawalRateSafe / 100);
    // Emergency buffer (separately maintained, but added to target corpus goal)
    const emergencyBuffer = monthlyExpenseAtRetirementGross * emergencyBufferMonthsSafe;
    this.targetCorpus = swrCorpus + emergencyBuffer;

    // 2. Month-by-month cashflow simulation
    let balance = currentCorpusSafe + oneTimeInvestmentSafe;
    let cumContributions = currentCorpusSafe + oneTimeInvestmentSafe;
    
    this.ledger = [];
    const ages: number[] = [];
    const corpusValues: number[] = [];
    const targetValues: number[] = [];
    const totalInvestedValues: number[] = [];

    // Year 0 (Today)
    this.ledger.push({
      year: 0,
      age: cAge,
      openingBalance: 0,
      contributions: currentCorpusSafe + oneTimeInvestmentSafe,
      growth: 0,
      withdrawals: 0,
      closingBalance: balance
    });
    ages.push(cAge);
    corpusValues.push(balance);
    targetValues.push(this.targetCorpus); // Flat line of goal
    totalInvestedValues.push(cumContributions);

    // Accumulation simulation
    for (let y = 1; y <= nAcc; y++) {
      const yearAge = cAge + y;
      const openingBalance = balance;
      let contributionsThisYear = 0;
      let growthThisYear = 0;

      // Compound monthly
      const yearlySipRate = monthlySIPSafe * Math.pow(1 + sipStepUpSafe / 100, y - 1);
      const rMonthly = expectedReturnPreSafe / 1200;

      for (let m = 1; m <= 12; m++) {
        const interest = balance * rMonthly;
        let monthlyContrib = yearlySipRate;

        // Apply ad-hoc investments at the end of the year (month 12)
        if (m === 12) {
          const adHoc = this.adHocInvestments
            .filter(inv => inv.year === y)
            .reduce((sum, inv) => sum + inv.amount, 0);
          monthlyContrib += adHoc;
        }

        balance += interest + monthlyContrib;
        contributionsThisYear += monthlyContrib;
        growthThisYear += interest;
      }

      cumContributions += contributionsThisYear;

      this.ledger.push({
        year: y,
        age: yearAge,
        openingBalance,
        contributions: contributionsThisYear,
        growth: growthThisYear,
        withdrawals: 0,
        closingBalance: balance
      });

      ages.push(yearAge);
      corpusValues.push(balance);
      targetValues.push(this.targetCorpus);
      totalInvestedValues.push(cumContributions);
    }

    this.projectedCorpus = balance;
    this.totalInvested = cumContributions;
    this.investmentGrowth = Math.max(0, this.projectedCorpus - this.totalInvested);
    this.shortfallOrSurplus = this.projectedCorpus - this.targetCorpus;

    // Reset longevity trackers
    this.depletionAge = -1;
    this.inheritance = 0;

    // Decumulation / Retirement simulation
    let retiredBalance = this.projectedCorpus;
    for (let y = 1; y <= nRet; y++) {
      const yearAge = rAge + y;
      const openingBalance = retiredBalance;
      let growthThisYear = 0;
      let withdrawalsThisYear = 0;

      const rMonthlyRet = expectedReturnPostSafe / 1200;
      // Inflate the net expense to this retirement year and gross up for tax
      const monthlyExpenseThisYearNet = monthlyExpenseAtRetirementNet * Math.pow(1 + inflationRateSafe / 100, y - 1);
      const monthlyWithdrawalNeeded = monthlyExpenseThisYearNet / (1 - retirementTaxSafe / 100);

      for (let m = 1; m <= 12; m++) {
        if (retiredBalance > 0) {
          const withdrawal = Math.min(retiredBalance, monthlyWithdrawalNeeded);
          retiredBalance -= withdrawal;
          withdrawalsThisYear += withdrawal;
          
          if (retiredBalance <= 0 && this.depletionAge === -1) {
            this.depletionAge = yearAge;
          }
        }
        
        const interest = retiredBalance * rMonthlyRet;
        retiredBalance += interest;
        growthThisYear += interest;
      }

      this.ledger.push({
        year: nAcc + y,
        age: yearAge,
        openingBalance,
        contributions: 0,
        growth: growthThisYear,
        withdrawals: withdrawalsThisYear,
        closingBalance: retiredBalance
      });

      ages.push(yearAge);
      corpusValues.push(retiredBalance);
      targetValues.push(this.targetCorpus);
      totalInvestedValues.push(this.totalInvested); // Contributions flat line
    }

    if (this.depletionAge === -1) {
      this.inheritance = retiredBalance;
    }

    // 3. Required SIP Today using numeric solver (Bisection search)
    this.requiredSIP = this.solveRequiredSIP(currentCorpusSafe + oneTimeInvestmentSafe, this.targetCorpus, nAcc, sipStepUpSafe, expectedReturnPreSafe);

    // 4. Required One-time Investment Today (Lump-sum)
    const shortfallAtRetirement = Math.max(0, this.targetCorpus - this.simulateAccumulationOnly(currentCorpusSafe + oneTimeInvestmentSafe, monthlySIPSafe, nAcc, sipStepUpSafe, expectedReturnPreSafe));
    if (shortfallAtRetirement <= 0) {
      this.requiredOneTime = 0;
    } else {
      this.requiredOneTime = shortfallAtRetirement / Math.pow(1 + expectedReturnPreSafe / 100, nAcc);
    }

    // 5. Time to Reach Corpus
    let reachedYear = -1;
    for (let y = 0; y <= nAcc; y++) {
      if (corpusValues[y] >= targetValues[y]) {
        reachedYear = y;
        break;
      }
    }

    if (reachedYear !== -1) {
      this.timeToReachCorpus = reachedYear === 0 ? 'Already reached!' : `${reachedYear} yrs (Age ${cAge + reachedYear})`;
    } else {
      this.timeToReachCorpus = 'Not reached by retirement';
    }

    // Update the Charts
    this.updateCharts(ages, corpusValues, targetValues, totalInvestedValues, nAcc);
  }

  getTargetCorpusForAccumulationYear(
    y: number, 
    cAge: number, 
    rAge: number, 
    monthlyExpenseToday: number, 
    inflation: number, 
    withdrawalRate: number
  ): number {
    // Current required corpus if the user retired at this year y
    const inflatedExp = monthlyExpenseToday * Math.pow(1 + inflation / 100, y);
    return (inflatedExp * 12) / (withdrawalRate / 100);
  }

  solveRequiredSIP(initial: number, target: number, nAcc: number, stepUp: number, expectedReturn: number): number {
    if (nAcc <= 0) return 0;
    
    // Check if 0 SIP is already enough
    if (this.simulateAccumulationOnly(initial, 0, nAcc, stepUp, expectedReturn) >= target) {
      return 0;
    }

    let low = 0;
    let high = 1e9; // Max 100 Crores
    let answer = 0;

    for (let i = 0; i < 35; i++) {
      const mid = (low + high) / 2;
      const endBalance = this.simulateAccumulationOnly(initial, mid, nAcc, stepUp, expectedReturn);
      if (endBalance >= target) {
        answer = mid;
        high = mid;
      } else {
        low = mid;
      }
    }
    return answer;
  }

  simulateAccumulationOnly(initial: number, sip: number, nAcc: number, stepUp: number, expectedReturn: number): number {
    let balance = initial;
    const rMonthly = expectedReturn / 1200;

    for (let y = 1; y <= nAcc; y++) {
      const yearlySipRate = sip * Math.pow(1 + stepUp / 100, y - 1);
      for (let m = 1; m <= 12; m++) {
        const interest = balance * rMonthly;
        let monthlyContrib = yearlySipRate;

        if (m === 12) {
          const adHoc = this.adHocInvestments
            .filter(inv => inv.year === y)
            .reduce((sum, inv) => sum + inv.amount, 0);
          monthlyContrib += adHoc;
        }

        balance += interest + monthlyContrib;
      }
    }
    return balance;
  }

  // Ad-hoc investment actions
  addAdHocRow() {
    let nextYear = 5;
    if (this.adHocInvestments.length > 0) {
      nextYear = Math.max(...this.adHocInvestments.map(inv => inv.year)) + 1;
    }
    const maxYear = Math.max(1, this.retirementAge - this.currentAge);
    if (nextYear > maxYear) nextYear = maxYear;

    this.adHocInvestments.push({ year: nextYear, amount: 100000 });
    this.calculate();
  }

  deleteAdHocRow(index: number) {
    this.adHocInvestments.splice(index, 1);
    this.calculate();
  }

  onAdHocChange() {
    this.calculate();
  }

  onCountryChange() {
    const config = this.currentCountry;
    this.inflationRate = config.defaultInflation;
    this.retirementTax = config.defaultTax;
    this.expectedReturnPre = config.defaultReturnPre;
    this.expectedReturnPost = config.defaultReturnPost;
    this.calculate();
  }

  // Currency Formatting helpers
  formatCurrency(value: number): string {
    if (value === undefined || value === null || isNaN(value)) {
      return `${this.currentCountry.symbol}0`;
    }
    return new Intl.NumberFormat(this.currentCountry.locale, {
      style: 'currency',
      currency: this.currentCountry.currency,
      maximumFractionDigits: 0
    }).format(Math.round(value));
  }

  formatCurrencyShort(value: number): string {
    if (value === undefined || value === null || isNaN(value)) {
      return `${this.currentCountry.symbol}0`;
    }
    const absVal = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const config = this.currentCountry;
    
    if (config.currency === 'INR') {
      if (absVal >= 10000000) {
        return `${sign}₹ ${(absVal / 10000000).toFixed(2)} Cr`;
      } else if (absVal >= 100000) {
        return `${sign}₹ ${(absVal / 100000).toFixed(2)} Lakh`;
      } else {
        return this.formatCurrency(value);
      }
    } else {
      if (absVal >= 1000000000) {
        return `${sign}${config.symbol}${(absVal / 1000000000).toFixed(2)} B`;
      } else if (absVal >= 1000000) {
        return `${sign}${config.symbol}${(absVal / 1000000).toFixed(2)} M`;
      } else if (absVal >= 1000) {
        return `${sign}${config.symbol}${(absVal / 1000).toFixed(1)} K`;
      } else {
        return this.formatCurrency(value);
      }
    }
  }

  // Compatibility aliases
  formatINR(value: number): string {
    return this.formatCurrency(value);
  }

  formatINRShort(value: number): string {
    return this.formatCurrencyShort(value);
  }

  // Chart Rendering and Updates
  updateCharts(ages: number[], corpus: number[], targets: number[], totalInvested: number[], accumulationYears: number) {
    if (!this.chartsInitialized) return;

    // 1. Corpus Growth Chart (Line Chart)
    const ctxCorpus = this.corpusChartCanvas?.nativeElement?.getContext('2d');
    if (ctxCorpus) {
      if (this.corpusChart) {
        this.corpusChart.destroy();
      }

      this.corpusChart = new Chart(ctxCorpus, {
        type: 'line',
        data: {
          labels: ages.map(age => `Age ${age}`),
          datasets: [
            {
              label: 'Projected Corpus',
              data: corpus,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              borderWidth: 3,
              fill: true,
              tension: 0.3,
              pointBackgroundColor: '#10b981',
              pointRadius: (ctx) => (ctx.dataIndex === this.retirementAge - this.currentAge ? 6 : 0), // highlight retirement age
              pointHoverRadius: 8
            },
            {
              label: 'Total Contributions',
              data: totalInvested,
              borderColor: '#6366f1',
              backgroundColor: 'transparent',
              borderWidth: 2,
              fill: false,
              pointRadius: 0,
              tension: 0.1
            },
            {
              label: 'Goal Target Milestone',
              data: targets,
              borderColor: '#f43f5e',
              borderDash: [6, 6],
              borderWidth: 2,
              fill: false,
              pointRadius: 0,
              tension: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: '#94a3b8',
                font: { family: 'Plus Jakarta Sans', size: 12 }
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const val = context.raw as number;
                  return ` ${context.dataset.label}: ${this.formatINR(val)}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(148, 163, 184, 0.08)' },
              ticks: {
                color: '#94a3b8',
                font: { family: 'Plus Jakarta Sans' },
                maxTicksLimit: 12
              }
            },
            y: {
              grid: { color: 'rgba(148, 163, 184, 0.08)' },
              ticks: {
                color: '#94a3b8',
                font: { family: 'Plus Jakarta Sans' },
                callback: (value) => this.formatINRShort(value as number)
              }
            }
          }
        }
      });
    }

    // 2. Contributions vs Growth (Doughnut Chart)
    const ctxContrib = this.contribChartCanvas?.nativeElement?.getContext('2d');
    if (ctxContrib) {
      if (this.contribChart) {
        this.contribChart.destroy();
      }

      this.contribChart = new Chart(ctxContrib, {
        type: 'doughnut',
        data: {
          labels: ['Total Contributions', 'Investment Growth'],
          datasets: [
            {
              data: [this.totalInvested, this.investmentGrowth],
              backgroundColor: ['#6366f1', '#10b981'],
              borderColor: '#151c2c',
              borderWidth: 2,
              hoverOffset: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#94a3b8',
                font: { family: 'Plus Jakarta Sans', size: 12 },
                padding: 15
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const val = context.raw as number;
                  const total = this.totalInvested + this.investmentGrowth;
                  const percent = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                  return ` ${context.label}: ${this.formatINR(val)} (${percent}%)`;
                }
              }
            }
          },
          cutout: '65%'
        }
      });
    }
  }

  // Switch tabs (Charts vs Ledger vs Guide)
  setTab(tab: 'charts' | 'ledger' | 'guide') {
    this.activeTab = tab;
    if (tab === 'charts') {
      // Re-render charts after angular updates DOM for canvas elements
      setTimeout(() => {
        this.calculate();
      }, 50);
    }
  }
}
