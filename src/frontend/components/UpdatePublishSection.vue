<script lang="ts">
import { defineComponent, h } from 'vue'
import UpdatePublishSectionImpl from './publish/UpdatePublishSection.vue'

export default defineComponent({
  name: 'UpdatePublishSectionCompat',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h(UpdatePublishSectionImpl as any, attrs, slots)
  }
})
</script>
