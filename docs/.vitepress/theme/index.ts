import DefaultTheme from 'vitepress/theme'
import LaunchPage from './LaunchPage.vue'
import PortalMap from './PortalMap.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LaunchPage', LaunchPage)
    app.component('PortalMap', PortalMap)
  },
}
