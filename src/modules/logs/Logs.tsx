import { useQuery } from '@tanstack/react-query'
import { Calculator, FileText } from 'lucide-react'
import { useState } from 'react'
import { logsService } from '../../shared/services/logsService'

export default function Logs() {
  const [activeTab, setActiveTab] = useState<'all' | 'tax'>('all')

  // Query for logs
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['logs'],
    queryFn: () => logsService.getLogs(100),
  })

  // Filter logs based on active tab
  const filteredLogs = activeTab === 'tax'
    ? logs.filter((log: any) =>
      log.title?.includes('Tax') ||
      log.title?.includes('tax') ||
      log.title?.includes('TVA') ||
      log.title?.includes('Vente - TVA collectée') ||
      log.description?.includes('TVA') ||
      log.description?.includes('tax')
    )
    : logs



  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-red-600">
          <p>Error loading logs:</p>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-gray-700" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Logs</h1>
              <p className="text-sm text-gray-500">
                {filteredLogs.length} events displayed
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${activeTab === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <FileText className="w-4 h-4 inline mr-1" />
              All
            </button>
            <button
              onClick={() => setActiveTab('tax')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${activeTab === 'tax'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <Calculator className="w-4 h-4 inline mr-1" />
              Tax
            </button>
          </div>

          {/* Test Button */}
          <button
            onClick={async () => {
              try {

                await logsService.logFinancialEvent(
                  'Test - Tax collected',
                  'Test with tax of $4.20 (20%)',
                  4.20,
                  {
                    tax_name: 'Tax',
                    tax_rate: 20.0,
                    tax_amount: 4.20,
                    subtotal: 21.0,
                    total: 25.20,
                    country: 'United States',
                    tax_mode: 'category_based',
                    test: true
                  }
                )
                // Reload logs
                window.location.reload()
              } catch (error) {
                console.error('❌ Erreur lors du test:', error)
                alert(`Erreur de test: ${error}`)
              }
            }}
            className="ml-4 px-3 py-1 bg-green-100 text-green-800 rounded-md text-sm font-medium hover:bg-green-200 transition-colors"
          >
            🧪 Test Log
          </button>
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileText className="w-12 h-12 mb-4" />
              <p className="text-lg font-medium">
                {activeTab === 'tax' ? 'Aucun log de TVA trouvé' : 'Aucun log trouvé'}
              </p>
              <p className="text-sm">
                {activeTab === 'tax' ? 'Les événements de TVA apparaîtront ici' : 'Les événements apparaîtront ici'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {filteredLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-medium text-gray-900">
                          {log.title}
                        </h3>
                        {log.amount && (
                          <span className="text-sm font-bold text-green-600">
                            {log.amount.toFixed(2)}€
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 mb-2">
                        {log.description}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-2">
                        {log.table_name && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            🍽️ Table: {log.table_name}
                          </span>
                        )}

                        {log.product_name && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            📦 {log.product_name}
                          </span>
                        )}

                        {log.metadata && (() => {
                          try {
                            const metadata = JSON.parse(log.metadata);
                            return (
                              <>
                                {metadata.payment_method && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    💳 {metadata.payment_method}
                                  </span>
                                )}
                                {metadata.customer_name && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                    👤 {metadata.customer_name}
                                  </span>
                                )}
                                {metadata.items_count && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    📊 {metadata.items_count} articles
                                  </span>
                                )}

                                {/* Détails de TVA */}
                                {metadata.tax_name && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    💰 {metadata.tax_name} {metadata.tax_rate}%
                                  </span>
                                )}
                                {metadata.country && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                    🌍 {metadata.country}
                                  </span>
                                )}
                                {metadata.tax_mode && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    📋 {metadata.tax_mode}
                                  </span>
                                )}
                              </>
                            );
                          } catch {
                            return null;
                          }
                        })()}
                      </div>

                      {/* Affichage détaillé des taxes si disponible */}
                      {log.metadata && (() => {
                        try {
                          const metadata = JSON.parse(log.metadata);
                          if (metadata.tax_breakdown && Array.isArray(metadata.tax_breakdown)) {
                            return (
                              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                <div className="text-xs font-medium text-gray-700 mb-2">
                                  📊 Détail des taxes:
                                </div>
                                <div className="space-y-1">
                                  {metadata.tax_breakdown.map((breakdown: any, index: number) => (
                                    <div key={index} className="flex justify-between text-xs">
                                      <span className="text-gray-600">
                                        {breakdown.tax_rate_name} ({breakdown.rate}%)
                                      </span>
                                      <span className="font-medium">
                                        {breakdown.tax_amount.toFixed(2)}€
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        } catch {
                          return null;
                        }
                      })()}

                      <div className="text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleString('fr-FR')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}