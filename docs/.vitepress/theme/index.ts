import DefaultTheme from 'vitepress/theme'
import PortalMap from './PortalMap.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('PortalMap', PortalMap)
  },
}
