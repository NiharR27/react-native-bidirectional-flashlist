import * as React from 'react';
import { Text, View, SafeAreaView, StyleSheet } from 'react-native';
import { FlashList } from 'react-native-bidirectional-flashlist';

const getEP = (pageNumber: number = 2) => {
  return `https://api.punkapi.com/v2/beers?page=${pageNumber}&per_page=15`;
};

export default function App() {
  const [data, setData] = React.useState([]);

  const [pageNumber, setPageNumber] = React.useState(2);

  const [pageInfo, setPageInfo] = React.useState({
    hasNextPage: true,
    hasPreviousPage: true,
  });

  const [loading, setLoading] = React.useState<boolean>(false);

  const handleEndReached = async () => {
    if (loading || !pageInfo.hasNextPage) return;
    try {
      setLoading(true);
      const response = await fetch(getEP(pageNumber));
      if (response.ok) {
        const json = await response.json();

        setPageNumber(pageNumber + 1);
        setPageInfo({
          hasNextPage: json.length > 0,
          hasPreviousPage: true,
        });
        setData([...data, ...json]);
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartReached = async () => {
    if (loading || !pageInfo.hasPreviousPage) return;
    try {
      setLoading(true);
      const response = await fetch(getEP(pageNumber - 1));
      if (response.ok) {
        const json = await response.json();
        setPageNumber(pageNumber - 1);
        setPageInfo({
          hasNextPage: true,
          hasPreviousPage: json.length > 0,
        });
        setData([...json, ...data]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingTop: 10 }}>
        <FlashList
          data={data}
          renderItem={ListItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={80}
          ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.05}
          onStartReached={handleStartReached}
          onStartReachedThreshold={0.05}
          pageInfo={{
            hasNextPage: pageInfo.hasNextPage,
            hasPreviousPage: pageInfo.hasPreviousPage,
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const ListItem = ({ item }: { item: { tagline: string } }) => {
  return (
    <View style={styles.itemContainer}>
      <Text style={styles.itemText}>{item.tagline}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 10,
  },
  itemContainer: {
    height: 80,
    borderWidth: 1,
    borderRadius: 5,
    marginHorizontal: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
  },
  itemText: {
    fontSize: 20,
    fontWeight: 'bold',
    paddingHorizontal: 15,
  },
});
