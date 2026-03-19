<script lang="ts">
import { defineComponent, h } from 'vue'
import CreatePublishSectionImpl from './publish/CreatePublishSection.vue'

export default defineComponent({
  name: 'CreatePublishSectionCompat',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h(CreatePublishSectionImpl as any, attrs, slots)
  }
})
</script>
