import { UnstructuredDirectoryLoader } from "@langchain/community/document_loaders/fs/unstructured";

const load = async () => {
  const directoryLoader = new UnstructuredDirectoryLoader(
    "C:\\Users\\kabir\\Documents\\doc-ai", {
      strategy: "hi_res",
      chunking_strategy: "basic",
      max_characters: 1000,
      overlap: 150,
      include_orig_elements: false,
      additional_partition_args: {
          "unique_element_ids": true,
          "split_pdf_page": true,
          "split_pdf_allow_failed": true,
          "split_pdf_concurrency_level": 15
      }
    }
  )

  const directoryDocs = await directoryLoader.load();
  console.log("directoryDocs.length: ", directoryDocs.length);
  console.log(directoryDocs[0]);
}

load();
