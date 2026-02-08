import { invoke } from '@tauri-apps/api/core'
import {
    AIConfig,
    AIConfigRequest,
    AIConfigResponse,
    AITestRequest,
    AITestResponse
} from '../types/aiConfig'

export const aiConfigService = {
    // Obtener la configuración AI actual
    async getAIConfig(): Promise<AIConfig | null> {
        try {
            return await invoke<AIConfig | null>('get_ai_config')
        } catch (error) {
            console.error('Error getting AI config:', error)
            return null
        }
    },

    // Guardar la configuración AI
    async saveAIConfig(config: AIConfigRequest): Promise<AIConfigResponse> {
        try {
            return await invoke<AIConfigResponse>('save_ai_config', { config })
        } catch (error) {
            console.error('Error saving AI config:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    },

    // Probar la configuración AI
    async testAIConfig(testConfig: AITestRequest): Promise<AITestResponse> {
        try {
            return await invoke<AITestResponse>('test_ai_config', { testConfig })
        } catch (error) {
            console.error('Error testing AI config:', error)
            return {
                success: false,
                message: 'Test failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    },

    // Eliminar la configuración AI
    async deleteAIConfig(): Promise<AIConfigResponse> {
        try {
            return await invoke<AIConfigResponse>('delete_ai_config')
        } catch (error) {
            console.error('Error deleting AI config:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    },

    // Verificar si existe una configuración AI
    async hasAIConfig(): Promise<boolean> {
        try {
            const config = await this.getAIConfig()
            return config !== null && config.is_active
        } catch (error) {
            console.error('Error checking AI config:', error)
            return false
        }
    },

    // Obtenir l'URL de l'API avec la clé
    async getAPIUrlWithKey(): Promise<{ url: string; key: string } | null> {
        try {
            const config = await this.getAIConfig()
            if (!config || !config.is_active) {
                return null
            }

            return {
                url: config.api_url,
                key: config.api_key
            }
        } catch (error) {
            console.error('Error getting API URL with key:', error)
            return null
        }
    }
}
