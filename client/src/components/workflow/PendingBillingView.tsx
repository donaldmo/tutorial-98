import { CheckIcon } from 'lucide-react'

import { formatPlanPrice, getPlanCardLines, isRecommendedPlan } from '@/lib/saasPlans'

type BillingPlan = {
  id: string
  name: string
  price_monthly: number
  price_annual: number
}

type CheckoutSnapshot = {
  status?: string | null
  reference?: string | null
}

type PendingBillingViewProps = {
  paidPlans: BillingPlan[]
  selectedBillingPlan: BillingPlan | null
  selectedBillingCycle: 'monthly' | 'annual'
  selectedBillingPrice: number
  checkout: CheckoutSnapshot | null | undefined
  isPendingCheckoutSelection: boolean
  billingActionLoading: string | null
  onSelectPlan: (planId: string) => void
  onSelectBillingCycle: (cycle: 'monthly' | 'annual') => void
  onContinueToCheckout: () => void
  formatStatusLabel: (value: string | null | undefined) => string
}

export function PendingBillingView({
  paidPlans,
  selectedBillingPlan,
  selectedBillingCycle,
  selectedBillingPrice,
  checkout,
  isPendingCheckoutSelection,
  billingActionLoading,
  onSelectPlan,
  onSelectBillingCycle,
  onContinueToCheckout,
  formatStatusLabel,
}: PendingBillingViewProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="max-w-2xl">
          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
            Complete Billing
          </span>
          <h3 className="mt-3 text-xl font-semibold text-gray-900">Finish setup and unlock your account</h3>
          <p className="mt-2 text-sm text-gray-600">
            Your organisation has been created successfully. To continue using the admin app, choose your paid plan and
            billing cycle here, then continue to Paystack to complete payment.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Current selection</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{selectedBillingPlan?.name || 'Select a plan'}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Billing cycle</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{formatStatusLabel(selectedBillingCycle)}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Checkout amount</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{formatPlanPrice(Number(selectedBillingPrice || 0))}</p>
            </div>
          </div>
        </div>

        <div className="lg:w-80 rounded-2xl border border-gray-100 bg-gray-50 p-5">
          <p className="text-sm font-semibold text-gray-900">Checkout summary</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Plan</dt>
              <dd className="font-medium text-gray-900">{selectedBillingPlan?.name || 'Select a plan'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Cycle</dt>
              <dd className="font-medium text-gray-900">{formatStatusLabel(selectedBillingCycle)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Amount</dt>
              <dd className="font-medium text-gray-900">{formatPlanPrice(Number(selectedBillingPrice || 0))}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Checkout status</dt>
              <dd className="font-medium text-gray-900">{formatStatusLabel(checkout?.status || 'not started')}</dd>
            </div>
          </dl>
          {checkout?.reference && (
            <p className="mt-4 text-xs text-gray-500 break-all">Existing reference: {checkout.reference}</p>
          )}
          <button
            onClick={onContinueToCheckout}
            disabled={billingActionLoading === 'retry' || !selectedBillingPlan}
            className="mt-5 w-full px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm disabled:bg-gray-300"
          >
            {billingActionLoading === 'retry'
              ? 'Opening checkout...'
              : isPendingCheckoutSelection
                ? 'Resume Paystack Checkout'
                : 'Continue to Paystack'}
          </button>
          <p className="mt-3 text-xs text-gray-500">
            You will stay on the subscription page until payment is completed or your organisation switches to the free
            plan.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-3">Choose a paid plan</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {paidPlans.map((planOption) => {
              const isSelected = planOption.id === selectedBillingPlan?.id
              const cardLines = getPlanCardLines(planOption)

              return (
                <button
                  key={planOption.id}
                  type="button"
                  onClick={() => onSelectPlan(planOption.id)}
                  className={`text-left rounded-2xl border p-5 transition-colors ${
                    isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-semibold text-gray-900">{planOption.name}</h4>
                        {isRecommendedPlan(planOption) && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                            Most popular
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        {formatPlanPrice(planOption.price_monthly)}/mo or {formatPlanPrice(planOption.price_annual)}/yr
                      </p>
                    </div>
                    <span
                      className={`mt-1 w-4 h-4 rounded-full border ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                      }`}
                    />
                  </div>
                  <ul className="mt-4 space-y-2">
                    {cardLines.slice(0, 3).map((line) => (
                      <li key={line} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-900 mb-3">Choose a billing cycle</p>
          <div className="space-y-3">
            {(['monthly', 'annual'] as const).map((cycle) => {
              const isSelected = selectedBillingCycle === cycle
              const amount = selectedBillingPlan
                ? cycle === 'annual'
                  ? selectedBillingPlan.price_annual
                  : selectedBillingPlan.price_monthly
                : 0

              return (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => onSelectBillingCycle(cycle)}
                  className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                    isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900">{cycle === 'annual' ? 'Annual billing' : 'Monthly billing'}</p>
                      <p className="mt-1 text-sm text-gray-500">{formatPlanPrice(Number(amount || 0))}</p>
                    </div>
                    <span
                      className={`mt-1 w-4 h-4 rounded-full border ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                      }`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
